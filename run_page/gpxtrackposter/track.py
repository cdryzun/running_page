"""Create and maintain info about a given activity track (corresponding to one GPX file)."""

# Copyright 2016-2019 Florian Pigorsch & Contributors. All rights reserved.
# 2019-now yihong0618 Florian Pigorsch & Contributors. All rights reserved.
# Use of this source code is governed by a MIT-style
# license that can be found in the LICENSE file.

import datetime
from datetime import timezone
import os
from collections import namedtuple
from statistics import median

import gpxpy as mod_gpxpy
import lxml
import polyline
import s2sphere as s2
from garmin_fit_sdk import Decoder, Stream
from garmin_fit_sdk.util import FIT_EPOCH_S
from polyline_processor import filter_out
from rich import print
from tcxreader.tcxreader import TCXReader

from .exceptions import TrackLoadError
from .utils import parse_datetime_to_local, get_normalized_sport_type

start_point = namedtuple("start_point", "lat lon")
run_map = namedtuple("polyline", "summary_polyline")

IGNORE_BEFORE_SAVING = os.getenv("IGNORE_BEFORE_SAVING", False)

# Garmin stores all latitude and longitude values as 32-bit integer values.
# This unit is called semicircle.
# So that gives 2^32 possible values.
# And to represent values up to 360° (or -180° to 180°), each 'degree' represents 2^32 / 360 = 11930465.
# So dividing latitude and longitude (int32) value by 11930465 will give the decimal value.
SEMICIRCLE = 11930465


class Track:
    def __init__(self):
        self.file_names = []
        self.polylines = []
        self.polyline_str = ""
        self.track_name = None
        self.start_time = None
        self.end_time = None
        self.start_time_local = None
        self.end_time_local = None
        self.length = 0
        self.special = False
        self.average_heartrate = None
        self.elevation_gain = None
        self.elevation_loss = None
        self.max_elevation = None
        self.min_elevation = None
        self.average_watts = None
        self.weighted_average_watts = None
        self.max_watts = None
        self.average_cadence = None
        self.max_cadence = None
        self.moving_dict = {}
        self._time_elev_points = []
        self.run_id = 0
        self.start_latlng = []
        self.type = "Run"
        self.subtype = None  # for fit file
        self.device = ""

    def load_gpx(self, file_name):
        """
        TODO refactor with load_tcx to one function
        """
        try:
            self.file_names = [os.path.basename(file_name)]
            # Handle empty gpx files
            # (for example, treadmill runs pulled via garmin-connect-export)
            if os.path.getsize(file_name) == 0:
                raise TrackLoadError("Empty GPX file")
            with open(file_name, "r", encoding="utf-8", errors="ignore") as file:
                self._load_gpx_data(mod_gpxpy.parse(file))
        except Exception as e:
            print(
                f"Something went wrong when loading GPX. for file {self.file_names[0]}, we just ignore this file and continue"
            )
            print(str(e))
            pass

    def load_tcx(self, file_name):
        try:
            self.file_names = [os.path.basename(file_name)]
            # Handle empty tcx files
            # (for example, treadmill runs pulled via garmin-connect-export)
            tcx = TCXReader()
            if os.path.getsize(file_name) == 0:
                raise TrackLoadError("Empty TCX file")
            self._load_tcx_data(tcx.read(file_name), file_name=file_name)
        except Exception as e:
            print(
                f"Something went wrong when loading TCX. for file {self.file_names[0]}, we just ignore this file and continue"
            )
            print(str(e))

    def load_fit(self, file_name):
        try:
            self.file_names = [os.path.basename(file_name)]
            # Handle empty fit files
            # (for example, treadmill runs pulled via garmin-connect-export)
            if os.path.getsize(file_name) == 0:
                raise TrackLoadError("Empty FIT file")
            stream = Stream.from_file(file_name)
            decoder = Decoder(stream)
            messages, errors = decoder.read(convert_datetimes_to_dates=False)
            if errors:
                print(
                    f"FIT file read fail: {errors}. The file appears to be corrupted and will be removed."
                )
                os.remove(file_name)
                return
            if (
                messages.get("session_mesgs") is None
                or messages.get("session_mesgs")[0].get("total_distance") is None
            ):
                print(
                    f"Session message or total distance is missing when loading FIT. for file {self.file_names[0]}, we just ignore this file and continue"
                )
                return
            self._load_fit_data(messages)
        except Exception as e:
            print(
                f"Something went wrong when loading FIT. for file {self.file_names[0]}, we just ignore this file and continue"
            )
            print(str(e))

    def load_from_db(self, activity):
        # use strava as file name
        self.file_names = [str(activity.run_id)]
        start_time = datetime.datetime.strptime(
            activity.start_date_local, "%Y-%m-%d %H:%M:%S"
        )
        self.start_time_local = start_time
        self.end_time = start_time + activity.elapsed_time
        self.length = float(activity.distance)
        if IGNORE_BEFORE_SAVING:
            summary_polyline = filter_out(activity.summary_polyline)
        else:
            summary_polyline = activity.summary_polyline
        polyline_data = polyline.decode(summary_polyline) if summary_polyline else []
        self.polylines = [[s2.LatLng.from_degrees(p[0], p[1]) for p in polyline_data]]
        self.run_id = activity.run_id
        self.type = get_normalized_sport_type(activity.type)
        # Load moving_dict from database
        self.moving_dict = {
            "distance": self.length,
            "moving_time": activity.moving_time,
            "elapsed_time": activity.elapsed_time,
            "average_speed": activity.average_speed or 0,
        }

    def bbox(self):
        """Compute the smallest rectangle that contains the entire track (border box)."""
        bbox = s2.LatLngRect()
        for line in self.polylines:
            for latlng in line:
                bbox = bbox.union(s2.LatLngRect.from_point(latlng.normalized()))
        return bbox

    @staticmethod
    def __make_run_id(time_stamp):
        return int(datetime.datetime.timestamp(time_stamp) * 1000)

    def _load_tcx_data(self, tcx, file_name):
        self.length = float(tcx.distance)
        time_values = [i.time for i in tcx.trackpoints]
        if not time_values:
            raise TrackLoadError("Track is empty.")

        self.start_time = tcx.start_time or time_values[0]
        self.end_time = tcx.end_time or time_values[-1]
        elapsed_time = tcx.duration or int(
            self.end_time.timestamp() - self.start_time.timestamp()
        )
        moving_time = self._calc_moving_time(tcx.trackpoints, 10)
        moving_time = moving_time or elapsed_time
        self.run_id = self.__make_run_id(self.start_time)
        self.average_heartrate = tcx.hr_avg
        polyline_container = []
        position_values = [(i.latitude, i.longitude) for i in tcx.trackpoints]
        if not position_values and int(self.length) == 0:
            raise Exception(
                f"This {file_name} TCX file do not contain distance and position values we ignore it"
            )
        if position_values:
            line = [s2.LatLng.from_degrees(p[0], p[1]) for p in position_values]
            self.polylines.append(line)
            polyline_container.extend([[p[0], p[1]] for p in position_values])
            self.polyline_container = polyline_container
            self.start_time_local, self.end_time_local = parse_datetime_to_local(
                self.start_time, self.end_time, polyline_container[0]
            )
            # get start point
            try:
                self.start_latlng = start_point(*polyline_container[0])
            except Exception as e:
                print(f"Error getting start point: {e}")
                pass
            self.polyline_str = polyline.encode(polyline_container)
        self.elevation_gain = tcx.ascent
        self.elevation_loss = getattr(tcx, "descent", None)
        self.max_elevation = getattr(tcx, "max_altitude", None)
        self.min_elevation = getattr(tcx, "min_altitude", None)
        self.average_watts = getattr(tcx, "avg_power", None)
        self.max_watts = getattr(tcx, "max_power", None)
        self.average_cadence = getattr(tcx, "cadence_avg", None)
        self.max_cadence = getattr(tcx, "cadence_max", None)
        self.moving_dict = {
            "distance": self.length,
            "moving_time": datetime.timedelta(seconds=moving_time),
            "elapsed_time": datetime.timedelta(seconds=elapsed_time),
            "average_speed": self.length / moving_time if moving_time else 0,
        }

    def _calc_moving_time(self, trackpoints, seconds_threshold=10):
        moving_time = 0
        try:
            start_time = self.start_time
            for i in range(1, len(trackpoints)):
                if trackpoints[i].time - trackpoints[i - 1].time <= datetime.timedelta(
                    seconds=seconds_threshold
                ):
                    moving_time += (
                        trackpoints[i].time.timestamp() - start_time.timestamp()
                    )
                start_time = trackpoints[i].time
            return int(moving_time)
        except Exception as e:
            print(f"Error calculating moving time: {e}")
            return 0

    @staticmethod
    def _calc_elevation_gain_loss(elevations):
        if not elevations or len(elevations) < 2:
            return 0.0, 0.0
        gain = 0.0
        loss = 0.0
        prev = elevations[0]
        for current in elevations[1:]:
            if current is None:
                continue
            delta = current - prev
            if delta > 0:
                gain += delta
            elif delta < 0:
                loss += -delta
            prev = current
        return gain, loss

    def _estimate_hiking_drift_corrected_loss(self):
        points = self._time_elev_points
        if not points or len(points) < 100:
            return None
        if self.elevation_gain is None:
            return None
        if self.elevation_loss is None:
            return None
        if (self.elevation_loss - self.elevation_gain) <= 30:
            return None

        start_time = points[0][0]
        end_time = points[-1][0]
        if start_time is None or end_time is None:
            return None

        duration_min = (end_time - start_time).total_seconds() / 60
        if duration_min <= 0:
            return None

        # Use stable start/end windows to suppress barometer drift at activity edges.
        window_min = max(10.0, min(35.0, duration_min * 0.1))
        window_delta = datetime.timedelta(minutes=window_min)
        start_cutoff = start_time + window_delta
        end_cutoff = end_time - window_delta

        start_samples = [e for t, e in points if t <= start_cutoff]
        end_samples = [e for t, e in points if t >= end_cutoff]
        if len(start_samples) < 20 or len(end_samples) < 20:
            return None

        robust_start = median(start_samples)
        robust_end = median(end_samples)
        robust_net = robust_end - robust_start
        corrected_loss = float(self.elevation_gain) - robust_net
        if corrected_loss < 0:
            return None
        return corrected_loss

    @staticmethod
    def _pick_elevation_metric(smoothed, raw, prefer_raw=False):
        smoothed_value = float(smoothed) if smoothed is not None else 0.0
        raw_value = float(raw) if raw is not None else 0.0

        if raw_value <= 0 and smoothed_value <= 0:
            return None
        if raw_value <= 0:
            return smoothed_value
        if smoothed_value <= 0:
            return raw_value
        if prefer_raw:
            return raw_value
        # If the smoothed result underestimates too much, use raw cumulative value.
        if raw_value > smoothed_value * 1.3:
            return raw_value
        return smoothed_value

    def _load_gpx_data(self, gpx):
        self.start_time, self.end_time = gpx.get_time_bounds()
        if self.start_time is None or self.end_time is None:
            # may be it's treadmill run, so we just use the start and end time of the extensions
            start_time_str = self._load_gpx_extensions_item(gpx, "start_time")
            end_time_str = self._load_gpx_extensions_item(gpx, "end_time")
            if start_time_str:
                self.start_time = datetime.datetime.fromisoformat(start_time_str)
            if end_time_str:
                self.end_time = datetime.datetime.fromisoformat(end_time_str)
            if self.start_time and self.end_time:
                self.start_time_local, self.end_time_local = parse_datetime_to_local(
                    self.start_time, self.end_time, None
                )
        # use timestamp as id
        self.run_id = self.__make_run_id(self.start_time)
        if self.start_time is None:
            raise TrackLoadError("Track has no start time.")
        if self.end_time is None:
            raise TrackLoadError("Track has no end time.")
        self.length = gpx.length_2d()
        moving_time = 0
        for t in gpx.tracks:
            for s in t.segments:
                moving_time += self._calc_moving_time(s.points, 10)
        gpx.simplify()
        if self.length == 0:
            self._load_gpx_extensions_data(gpx)
            return
        polyline_container = []
        heart_rate_list = []
        for t in gpx.tracks:
            if self.track_name is None:
                self.track_name = t.name
            if hasattr(t, "type") and t.type:
                self.type = "Run" if t.type == "running" else t.type
            for s in t.segments:
                try:
                    extensions = [
                        {
                            lxml.etree.QName(child).localname: child.text
                            for child in p.extensions[0]
                        }
                        for p in s.points
                        if p.extensions
                    ]
                    heart_rate_list.extend(
                        [
                            int(p["hr"]) if p.__contains__("hr") else None
                            for p in extensions
                            if extensions
                        ]
                    )
                    heart_rate_list = list(filter(None, heart_rate_list))
                except lxml.etree.XMLSyntaxError:
                    # Ignore XML syntax errors in extensions
                    # This can happen if the GPX file is malformed
                    pass
                line = [
                    s2.LatLng.from_degrees(p.latitude, p.longitude) for p in s.points
                ]
                self.polylines.append(line)
                polyline_container.extend([[p.latitude, p.longitude] for p in s.points])
                self.polyline_container = polyline_container
        # get start point
        try:
            self.start_latlng = start_point(*polyline_container[0])
        except Exception as e:
            print(f"Error getting start point: {e}")
            pass
        self.start_time_local, self.end_time_local = parse_datetime_to_local(
            self.start_time, self.end_time, polyline_container[0]
        )
        self.polyline_str = polyline.encode(polyline_container)
        self.average_heartrate = (
            sum(heart_rate_list) / len(heart_rate_list) if heart_rate_list else None
        )
        self.moving_dict = self._get_moving_data(gpx, moving_time)
        uphill_downhill = gpx.get_uphill_downhill()
        smoothed_gain = uphill_downhill.uphill
        smoothed_loss = uphill_downhill.downhill
        elevations = []
        self._time_elev_points = []
        for t in gpx.tracks:
            for s in t.segments:
                for p in s.points:
                    if p.elevation is None:
                        continue
                    elevations.append(p.elevation)
                    if p.time is not None:
                        self._time_elev_points.append((p.time, p.elevation))

        if elevations:
            calc_gain, calc_loss = self._calc_elevation_gain_loss(elevations)
            creator = str(getattr(gpx, "creator", "") or "").lower()
            prefer_raw = "garmin" in creator
            self.elevation_gain = self._pick_elevation_metric(
                smoothed_gain, calc_gain, prefer_raw=prefer_raw
            )
            self.elevation_loss = self._pick_elevation_metric(
                smoothed_loss, calc_loss, prefer_raw=prefer_raw
            )
            self.max_elevation = max(elevations)
            self.min_elevation = min(elevations)
        else:
            self.elevation_gain = (
                float(smoothed_gain) if smoothed_gain is not None else None
            )
            self.elevation_loss = (
                float(smoothed_loss) if smoothed_loss is not None else None
            )
        self._load_gpx_extensions_data(gpx)

    def _load_gpx_extensions_item(self, gpx, item_name):
        """
        Load a specific extension item from the GPX file.
        This is used to load specific data like distance, average speed, etc.
        """
        gpx_extensions = (
            {}
            if gpx.extensions is None
            else {
                lxml.etree.QName(extension).localname: extension.text
                for extension in gpx.extensions
            }
        )
        return (
            gpx_extensions.get(item_name)
            if gpx_extensions.get(item_name) is not None
            else None
        )

    def _load_gpx_extensions_data(self, gpx):
        gpx_extensions = (
            {}
            if gpx.extensions is None
            else {
                lxml.etree.QName(extension).localname: extension.text
                for extension in gpx.extensions
            }
        )

        def _ext_float(*keys):
            for key in keys:
                value = gpx_extensions.get(key)
                if value is None or value == "":
                    continue
                try:
                    return float(value)
                except Exception:
                    continue
            return None

        self.length = (
            self.length
            if gpx_extensions.get("distance") is None
            else float(gpx_extensions.get("distance"))
        )
        self.average_heartrate = (
            self.average_heartrate
            if gpx_extensions.get("average_hr") is None
            else float(gpx_extensions.get("average_hr"))
        )
        self.moving_dict["average_speed"] = (
            self.moving_dict["average_speed"]
            if gpx_extensions.get("average_speed") is None
            else float(gpx_extensions.get("average_speed"))
        )
        self.moving_dict["distance"] = (
            self.moving_dict["distance"]
            if gpx_extensions.get("distance") is None
            else float(gpx_extensions.get("distance"))
        )

        self.moving_dict["moving_time"] = (
            self.moving_dict["moving_time"]
            if gpx_extensions.get("moving_time") is None
            else datetime.timedelta(seconds=float(gpx_extensions.get("moving_time")))
        )

        self.moving_dict["elapsed_time"] = (
            self.moving_dict["elapsed_time"]
            if gpx_extensions.get("elapsed_time") is None
            else datetime.timedelta(seconds=float(gpx_extensions.get("elapsed_time")))
        )

        # Garmin summary fields appended in garmin_sync.py
        extension_gain = _ext_float(
            "elevation_gain",
            "total_elevation_gain",
            "total_ascent",
            "ascent",
            "elevationGain",
        )
        extension_loss = _ext_float(
            "elevation_loss",
            "total_elevation_loss",
            "total_descent",
            "descent",
            "elevationLoss",
        )
        extension_max_elevation = _ext_float(
            "max_elevation",
            "max_altitude",
            "maxElevation",
            "enhanced_max_altitude",
        )
        extension_min_elevation = _ext_float(
            "min_elevation",
            "min_altitude",
            "minElevation",
            "enhanced_min_altitude",
        )

        if extension_gain is not None:
            self.elevation_gain = extension_gain
        if extension_loss is not None:
            self.elevation_loss = extension_loss
        if extension_max_elevation is not None:
            if self.max_elevation is None:
                self.max_elevation = extension_max_elevation
            else:
                self.max_elevation = max(float(self.max_elevation), extension_max_elevation)
        if extension_min_elevation is not None:
            if self.min_elevation is None:
                self.min_elevation = extension_min_elevation
            else:
                self.min_elevation = min(float(self.min_elevation), extension_min_elevation)

        normalized_type = get_normalized_sport_type(self.type)
        if (
            normalized_type == "hiking"
            and extension_loss is None
            and self.elevation_gain is not None
            and self.elevation_loss is not None
        ):
            corrected_loss = self._estimate_hiking_drift_corrected_loss()
            if corrected_loss is not None:
                self.elevation_loss = corrected_loss

        self.average_watts = _ext_float(
            "average_watts",
            "avg_watts",
            "average_power",
            "avg_power",
            "avgPower",
        )
        self.weighted_average_watts = _ext_float(
            "weighted_average_watts",
            "weighted_power",
            "normalized_power",
            "normalizedPower",
        )
        self.max_watts = _ext_float("max_watts", "max_power", "maxPower")
        self.average_cadence = _ext_float(
            "average_cadence",
            "avg_cadence",
            "average_bike_cadence",
            "averageBikeCadenceInRevPerMinute",
            "averageRunCadence",
        )
        self.max_cadence = _ext_float(
            "max_cadence",
            "max_bike_cadence",
            "maxBikeCadence",
            "maxRunCadence",
        )

    def _load_fit_data(self, fit: dict):
        _polylines = []
        self.polyline_container = []
        message = fit["session_mesgs"][0]
        self.start_time = datetime.datetime.fromtimestamp(
            (message["start_time"] + FIT_EPOCH_S), tz=timezone.utc
        )
        self.run_id = self.__make_run_id(self.start_time)
        self.end_time = datetime.datetime.fromtimestamp(
            (message["start_time"] + FIT_EPOCH_S + message["total_elapsed_time"]),
            tz=timezone.utc,
        )
        self.length = message["total_distance"]
        self.average_heartrate = (
            message["avg_heart_rate"] if "avg_heart_rate" in message else None
        )
        if message["sport"].lower() == "running":
            self.type = "Run"
        else:
            self.type = message["sport"].lower()
        self.subtype = message["sub_sport"] if "sub_sport" in message else None

        self.elevation_gain = (
            message["total_ascent"] if "total_ascent" in message else None
        )
        self.elevation_loss = (
            message["total_descent"] if "total_descent" in message else None
        )
        self.max_elevation = message.get(
            "enhanced_max_altitude", message.get("max_altitude")
        )
        self.min_elevation = message.get(
            "enhanced_min_altitude", message.get("min_altitude")
        )
        self.average_watts = message.get("avg_power")
        self.weighted_average_watts = message.get(
            "normalized_power", message.get("weighted_average_power")
        )
        self.max_watts = message.get("max_power")
        self.average_cadence = message.get(
            "avg_bike_cadence", message.get("avg_cadence")
        )
        self.max_cadence = message.get(
            "max_bike_cadence", message.get("max_cadence")
        )
        # moving_dict
        self.moving_dict["distance"] = message["total_distance"]
        self.moving_dict["moving_time"] = datetime.timedelta(
            seconds=(
                message["total_moving_time"]
                if "total_moving_time" in message
                else message["total_timer_time"]
            )
        )
        self.moving_dict["elapsed_time"] = datetime.timedelta(
            seconds=message["total_elapsed_time"]
        )
        self.moving_dict["average_speed"] = (
            message["enhanced_avg_speed"]
            if message["enhanced_avg_speed"]
            else message["avg_speed"]
        )
        elevation_points = []
        for record in fit["record_mesgs"]:
            if "position_lat" in record and "position_long" in record:
                lat = record["position_lat"] / SEMICIRCLE
                lng = record["position_long"] / SEMICIRCLE
                _polylines.append(s2.LatLng.from_degrees(lat, lng))
                self.polyline_container.append([lat, lng])
            if "enhanced_altitude" in record and record["enhanced_altitude"] is not None:
                elevation_points.append(float(record["enhanced_altitude"]))
            elif "altitude" in record and record["altitude"] is not None:
                elevation_points.append(float(record["altitude"]))

        if elevation_points:
            calc_gain, calc_loss = self._calc_elevation_gain_loss(elevation_points)
            if (self.elevation_gain is None or self.elevation_gain <= 0) and calc_gain > 0:
                self.elevation_gain = calc_gain
            if (self.elevation_loss is None or self.elevation_loss <= 0) and calc_loss > 0:
                self.elevation_loss = calc_loss
            if self.max_elevation is None:
                self.max_elevation = max(elevation_points)
            if self.min_elevation is None:
                self.min_elevation = min(elevation_points)
        if self.polyline_container:
            self.start_time_local, self.end_time_local = parse_datetime_to_local(
                self.start_time, self.end_time, self.polyline_container[0]
            )
            self.start_latlng = start_point(*self.polyline_container[0])
            self.polylines.append(_polylines)
            self.polyline_str = polyline.encode(self.polyline_container)
        else:
            self.start_time_local, self.end_time_local = parse_datetime_to_local(
                self.start_time, self.end_time, None
            )

        # The FIT file created by Garmin
        if "file_id_mesgs" in fit:
            device_message = fit["file_id_mesgs"][0]
            if "manufacturer" in device_message:
                self.device = device_message["manufacturer"]
            if "garmin_product" in device_message:
                self.device += " " + device_message["garmin_product"]

    def append(self, other):
        """Append other track to self."""
        self.end_time = other.end_time
        self.length += other.length
        # TODO maybe a better way
        try:
            self.moving_dict["distance"] += other.moving_dict["distance"]
            self.moving_dict["moving_time"] += other.moving_dict["moving_time"]
            self.moving_dict["elapsed_time"] += other.moving_dict["elapsed_time"]
            self.polyline_container.extend(other.polyline_container)
            self.polyline_str = polyline.encode(self.polyline_container)
            self.moving_dict["average_speed"] = (
                self.moving_dict["distance"]
                / self.moving_dict["moving_time"].total_seconds()
            )
            self.file_names.extend(other.file_names)
            self.special = self.special or other.special
            self.average_heartrate = self.average_heartrate or other.average_heartrate
            self.elevation_gain = (
                self.elevation_gain if self.elevation_gain else 0
            ) + (other.elevation_gain if other.elevation_gain else 0)
            self.elevation_loss = (
                self.elevation_loss if self.elevation_loss else 0
            ) + (other.elevation_loss if other.elevation_loss else 0)
            if other.max_elevation is not None:
                if self.max_elevation is None:
                    self.max_elevation = other.max_elevation
                else:
                    self.max_elevation = max(self.max_elevation, other.max_elevation)
            if other.min_elevation is not None:
                if self.min_elevation is None:
                    self.min_elevation = other.min_elevation
                else:
                    self.min_elevation = min(self.min_elevation, other.min_elevation)
            self.average_watts = self.average_watts or other.average_watts
            self.weighted_average_watts = (
                self.weighted_average_watts or other.weighted_average_watts
            )
            if other.max_watts is not None:
                if self.max_watts is None:
                    self.max_watts = other.max_watts
                else:
                    self.max_watts = max(self.max_watts, other.max_watts)
            self.average_cadence = self.average_cadence or other.average_cadence
            if other.max_cadence is not None:
                if self.max_cadence is None:
                    self.max_cadence = other.max_cadence
                else:
                    self.max_cadence = max(self.max_cadence, other.max_cadence)
        except Exception as e:
            print(
                f"something wrong append this {self.end_time},in files {str(self.file_names)}: {e}"
            )
            pass

    @staticmethod
    def _get_moving_data(gpx, moving_time):
        moving_data = gpx.get_moving_data()
        elapsed_time = moving_data.moving_time
        moving_time = moving_time or elapsed_time
        return {
            "distance": moving_data.moving_distance,
            "moving_time": datetime.timedelta(seconds=moving_time),
            "elapsed_time": datetime.timedelta(seconds=elapsed_time),
            "average_speed": (
                moving_data.moving_distance / moving_time if moving_time else 0
            ),
        }

    def to_namedtuple(self, run_from="gpx"):
        d = {
            "id": self.run_id,
            "name": (self.track_name if self.track_name else ""),  # maybe change later
            "type": self.type,
            "subtype": (self.subtype if self.subtype else ""),
            "start_date": self.start_time.strftime("%Y-%m-%d %H:%M:%S"),
            "end": self.end_time.strftime("%Y-%m-%d %H:%M:%S"),
            "start_date_local": self.start_time_local.strftime("%Y-%m-%d %H:%M:%S"),
            "end_local": self.end_time_local.strftime("%Y-%m-%d %H:%M:%S"),
            "length": self.length,
            "average_heartrate": (
                int(self.average_heartrate) if self.average_heartrate else None
            ),
            "elevation_gain": (
                int(self.elevation_gain)
                if self.elevation_gain is not None
                else 0
            ),
            "elevation_loss": (
                int(round(self.elevation_loss))
                if self.elevation_loss is not None
                else None
            ),
            "max_elevation": (
                float(self.max_elevation) if self.max_elevation is not None else None
            ),
            "min_elevation": (
                float(self.min_elevation) if self.min_elevation is not None else None
            ),
            "average_watts": (
                float(self.average_watts) if self.average_watts is not None else None
            ),
            "weighted_average_watts": (
                float(self.weighted_average_watts)
                if self.weighted_average_watts is not None
                else None
            ),
            "max_watts": float(self.max_watts) if self.max_watts is not None else None,
            "average_cadence": (
                float(self.average_cadence)
                if self.average_cadence is not None
                else None
            ),
            "max_cadence": (
                float(self.max_cadence) if self.max_cadence is not None else None
            ),
            "map": run_map(self.polyline_str),
            "start_latlng": self.start_latlng,
        }
        d.update(self.moving_dict)
        # return a nametuple that can use . to get attr
        return namedtuple("x", d.keys())(*d.values())
