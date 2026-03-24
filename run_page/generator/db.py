import datetime
import math
import random
import string

from geopy.geocoders import options, Nominatim
from sqlalchemy import (
    Column,
    Float,
    Integer,
    Interval,
    String,
    create_engine,
    inspect,
    text,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()


# random user name 8 letters
def randomword():
    letters = string.ascii_lowercase
    return "".join(random.choice(letters) for i in range(4))


options.default_user_agent = "running_page"
# reverse the location (lat, lon) -> location detail
g = Nominatim(user_agent=randomword())

CYCLING_TYPE_KEYWORDS = ("ride", "cycling", "bike", "ebike", "mountainbike")
LOOP_END_DISTANCE_M = 500.0
LOOP_ELEVATION_FIX_TRIGGER_M = 20.0
LOOP_ELEVATION_BALANCE_TOLERANCE_M = 5.0


ACTIVITY_KEYS = [
    "run_id",
    "name",
    "distance",
    "moving_time",
    "type",
    "subtype",
    "start_date",
    "start_date_local",
    "location_country",
    "summary_polyline",
    "average_heartrate",
    "average_speed",
    "elevation_gain",
    "elevation_loss",
    "max_elevation",
    "min_elevation",
    "average_watts",
    "weighted_average_watts",
    "max_watts",
    "average_cadence",
    "max_cadence",
]


class Activity(Base):
    __tablename__ = "activities"

    run_id = Column(Integer, primary_key=True)
    name = Column(String)
    distance = Column(Float)
    moving_time = Column(Interval)
    elapsed_time = Column(Interval)
    type = Column(String)
    subtype = Column(String)
    start_date = Column(String)
    start_date_local = Column(String)
    location_country = Column(String)
    summary_polyline = Column(String)
    average_heartrate = Column(Float)
    average_speed = Column(Float)
    elevation_gain = Column(Float)
    elevation_loss = Column(Float)
    max_elevation = Column(Float)
    min_elevation = Column(Float)
    average_watts = Column(Float)
    weighted_average_watts = Column(Float)
    max_watts = Column(Float)
    average_cadence = Column(Float)
    max_cadence = Column(Float)
    streak = None

    def to_dict(self):
        out = {}
        for key in ACTIVITY_KEYS:
            attr = getattr(self, key)
            if isinstance(attr, (datetime.timedelta, datetime.datetime)):
                out[key] = str(attr)
            else:
                out[key] = attr

        if self.streak:
            out["streak"] = self.streak

        return out


def _looks_like_cycling(activity_type):
    lower = str(activity_type or "").lower()
    return any(keyword in lower for keyword in CYCLING_TYPE_KEYWORDS)


def _decode_polyline_start_end_distance(summary_polyline):
    if not summary_polyline:
        return None
    try:
        index = 0
        lat = 0
        lng = 0
        first = None
        last = None
        length = len(summary_polyline)
        while index < length:
            shift = 0
            result = 0
            while True:
                b = ord(summary_polyline[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            dlat = ~(result >> 1) if (result & 1) else (result >> 1)
            lat += dlat

            shift = 0
            result = 0
            while True:
                b = ord(summary_polyline[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            dlng = ~(result >> 1) if (result & 1) else (result >> 1)
            lng += dlng
            point = (lat / 1e5, lng / 1e5)
            if first is None:
                first = point
            last = point
        if first is None or last is None:
            return None

        lat1, lon1 = first
        lat2, lon2 = last
        r = 6371000.0
        p1 = math.radians(lat1)
        p2 = math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    except Exception:
        return None


def _normalize_loop_cycling_loss(
    activity_type, elevation_gain, elevation_loss, summary_polyline
):
    if (
        elevation_gain is None
        or elevation_loss is None
        or not _looks_like_cycling(activity_type)
    ):
        return elevation_loss

    diff = float(elevation_loss) - float(elevation_gain)
    if abs(diff) <= LOOP_ELEVATION_FIX_TRIGGER_M:
        return elevation_loss

    start_end_distance = _decode_polyline_start_end_distance(summary_polyline)
    if start_end_distance is None or start_end_distance > LOOP_END_DISTANCE_M:
        return elevation_loss

    if diff >= 0:
        return float(elevation_gain) + LOOP_ELEVATION_BALANCE_TOLERANCE_M
    return max(0.0, float(elevation_gain) - LOOP_ELEVATION_BALANCE_TOLERANCE_M)


def update_or_create_activity(session, run_activity, *, raise_on_error=False):
    def _pick_attr(obj, names):
        for name in names:
            if hasattr(obj, name):
                value = getattr(obj, name)
                if value is not None:
                    return value
        return None

    def _to_float_or_none(value):
        if value is None:
            return None
        try:
            return float(value)
        except Exception:
            try:
                return float(getattr(value, "num"))
            except Exception:
                return None

    def _extract_summary_polyline(obj):
        map_obj = getattr(obj, "map", None)
        if map_obj is None:
            return ""
        return getattr(map_obj, "summary_polyline", "") or ""

    run_activity_id = getattr(run_activity, "id", getattr(run_activity, "run_id", None))
    created = False
    try:
        if run_activity_id is None:
            raise ValueError("run activity id is missing")
        activity = (
            session.query(Activity).filter_by(run_id=int(run_activity_id)).first()
        )

        current_elevation_gain = _to_float_or_none(
            _pick_attr(
                run_activity,
                [
                    "total_elevation_gain",
                    "elevation_gain",
                    "totalElevationGain",
                    "elevationGain",
                    "total_ascent",
                    "ascent",
                ],
            )
        )
        current_elevation_loss = _to_float_or_none(
            _pick_attr(
                run_activity,
                [
                    "total_elevation_loss",
                    "elevation_loss",
                    "totalElevationLoss",
                    "elevationLoss",
                    "total_downhill",
                    "total_descent",
                    "totalDescent",
                    "totalDownhill",
                    "descent",
                ],
            )
        )
        current_max_elevation = _to_float_or_none(
            _pick_attr(
                run_activity,
                [
                    "elev_high",
                    "max_elevation",
                    "max_altitude",
                    "maxElevation",
                    "enhancedMaxElevation",
                    "enhanced_max_altitude",
                ],
            )
        )
        current_min_elevation = _to_float_or_none(
            _pick_attr(
                run_activity,
                [
                    "elev_low",
                    "min_elevation",
                    "min_altitude",
                    "minElevation",
                    "enhancedMinElevation",
                    "enhanced_min_altitude",
                ],
            )
        )
        current_average_watts = _to_float_or_none(
            _pick_attr(
                run_activity,
                [
                    "average_watts",
                    "avg_watts",
                    "avg_power",
                    "average_power",
                    "avgPower",
                    "averageWatts",
                ],
            )
        )
        current_weighted_average_watts = _to_float_or_none(
            _pick_attr(
                run_activity,
                [
                    "weighted_average_watts",
                    "weighted_avg_watts",
                    "weighted_power",
                    "normalized_power",
                    "weightedAverageWatts",
                    "normalizedPower",
                    "weightedAveragePower",
                ],
            )
        )
        current_max_watts = _to_float_or_none(
            _pick_attr(run_activity, ["max_watts", "max_power", "maxPower", "maxWatts"])
        )
        current_average_cadence = _to_float_or_none(
            _pick_attr(
                run_activity,
                [
                    "average_cadence",
                    "avg_cadence",
                    "average_bike_cadence",
                    "avg_cad",
                    "averageBikeCadenceInRevPerMinute",
                    "averageRunCadence",
                    "averageCadence",
                ],
            )
        )
        current_max_cadence = _to_float_or_none(
            _pick_attr(
                run_activity,
                [
                    "max_cadence",
                    "max_bike_cadence",
                    "max_cad",
                    "maxBikeCadenceInRevPerMinute",
                    "maxRunCadence",
                    "maxCadence",
                ],
            )
        )

        if not activity:
            start_point = run_activity.start_latlng
            location_country = getattr(run_activity, "location_country", "")
            # or China for #176 to fix
            if start_point and (not location_country or location_country == "China"):
                try:
                    location_country = str(
                        g.reverse(
                            f"{start_point.lat}, {start_point.lon}", language="zh-CN"  # type: ignore
                        )
                    )
                # limit (only for the first time)
                except Exception:
                    try:
                        location_country = str(
                            g.reverse(
                                f"{start_point.lat}, {start_point.lon}",
                                language="zh-CN",  # type: ignore
                            )
                        )
                    except Exception:
                        pass

            activity = Activity(
                run_id=run_activity_id,
                name=run_activity.name,
                distance=run_activity.distance,
                moving_time=run_activity.moving_time,
                elapsed_time=run_activity.elapsed_time,
                type=run_activity.type,
                subtype=run_activity.subtype,
                start_date=run_activity.start_date,
                start_date_local=run_activity.start_date_local,
                location_country=location_country,
                average_heartrate=run_activity.average_heartrate,
                average_speed=float(run_activity.average_speed),
                elevation_gain=(
                    current_elevation_gain
                    if current_elevation_gain is not None
                    else 0.0
                ),
                elevation_loss=_normalize_loop_cycling_loss(
                    run_activity.type,
                    (
                        current_elevation_gain
                        if current_elevation_gain is not None
                        else 0.0
                    ),
                    current_elevation_loss,
                    _extract_summary_polyline(run_activity),
                ),
                max_elevation=current_max_elevation,
                min_elevation=current_min_elevation,
                average_watts=current_average_watts,
                weighted_average_watts=current_weighted_average_watts,
                max_watts=current_max_watts,
                average_cadence=current_average_cadence,
                max_cadence=current_max_cadence,
                summary_polyline=_extract_summary_polyline(run_activity),
            )
            session.add(activity)
            created = True
        else:
            activity.name = run_activity.name
            activity.distance = float(run_activity.distance)
            activity.moving_time = run_activity.moving_time
            activity.elapsed_time = run_activity.elapsed_time
            activity.type = run_activity.type
            activity.subtype = run_activity.subtype
            activity.average_heartrate = run_activity.average_heartrate
            activity.average_speed = float(run_activity.average_speed)
            activity.elevation_gain = (
                current_elevation_gain
                if current_elevation_gain is not None
                else (
                    activity.elevation_gain
                    if activity.elevation_gain is not None
                    else 0.0
                )
            )
            if current_elevation_loss is not None:
                activity.elevation_loss = current_elevation_loss
            if current_max_elevation is not None:
                activity.max_elevation = current_max_elevation
            if current_min_elevation is not None:
                activity.min_elevation = current_min_elevation
            if current_average_watts is not None:
                activity.average_watts = current_average_watts
            if current_weighted_average_watts is not None:
                activity.weighted_average_watts = current_weighted_average_watts
            if current_max_watts is not None:
                activity.max_watts = current_max_watts
            if current_average_cadence is not None:
                activity.average_cadence = current_average_cadence
            if current_max_cadence is not None:
                activity.max_cadence = current_max_cadence
            current_polyline = _extract_summary_polyline(run_activity)
            if current_polyline:
                activity.summary_polyline = current_polyline

            activity.elevation_loss = _normalize_loop_cycling_loss(
                activity.type,
                activity.elevation_gain,
                activity.elevation_loss,
                activity.summary_polyline,
            )
    except Exception as e:
        print(f"something wrong with {run_activity_id}")
        print(str(e))
        if raise_on_error:
            raise

    return created


def add_missing_columns(engine, model):
    inspector = inspect(engine)
    table_name = model.__tablename__
    columns = {col["name"] for col in inspector.get_columns(table_name)}
    missing_columns = []

    for column in model.__table__.columns:
        if column.name not in columns:
            missing_columns.append(column)
    if missing_columns:
        with engine.connect() as conn:
            for column in missing_columns:
                column_type = str(column.type)
                conn.execute(
                    text(
                        f"ALTER TABLE {table_name} ADD COLUMN {column.name} {column_type}"
                    )
                )


def init_db(db_path):
    engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)

    # check missing columns
    add_missing_columns(engine, Activity)

    sm = sessionmaker(bind=engine)
    session = sm()
    # apply the changes
    session.commit()
    return session
