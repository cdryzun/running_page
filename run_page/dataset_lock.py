from __future__ import annotations

import os
import threading
from dataclasses import dataclass, field
from pathlib import Path
from types import TracebackType

try:
    import fcntl
except ImportError:  # pragma: no cover - Windows uses process-local locking.
    fcntl = None


class DatasetLockError(RuntimeError):
    """Raised when a dataset lock is used incorrectly."""


@dataclass
class _ProcessLockState:
    mutex: threading.RLock = field(default_factory=threading.RLock)
    file_descriptor: int | None = None
    depth: int = 0


_REGISTRY_MUTEX = threading.Lock()
_PROCESS_LOCKS: dict[Path, _ProcessLockState] = {}


def _state_for(path: Path) -> _ProcessLockState:
    with _REGISTRY_MUTEX:
        return _PROCESS_LOCKS.setdefault(path, _ProcessLockState())


class DatasetWriteLock:
    """Serialize writers that update a database and its generated artifacts.

    POSIX locks are attached to the database directory. The directory is a
    stable coordination point across atomic database replacements and does not
    interfere with SQLite's own byte-range locks.
    """

    def __init__(self, database_path: str | Path):
        self.database_path = Path(database_path).expanduser().resolve(strict=False)
        self._lock_path = self.database_path.parent
        self._state = _state_for(self._lock_path)
        self._acquired = False

    @property
    def supports_cross_process_locking(self) -> bool:
        return fcntl is not None

    def _acquire_file_descriptor(self) -> int | None:
        if fcntl is None:
            return None

        file_descriptor = os.open(
            self._lock_path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
        )
        try:
            fcntl.flock(file_descriptor, fcntl.LOCK_EX)
            return file_descriptor
        except BaseException:
            os.close(file_descriptor)
            raise

    def acquire(self) -> None:
        if self._acquired:
            raise DatasetLockError("Dataset lock instance is already acquired")

        self._state.mutex.acquire()
        try:
            if self._state.depth == 0:
                self._state.file_descriptor = self._acquire_file_descriptor()
            self._state.depth += 1
            self._acquired = True
        except BaseException:
            self._state.mutex.release()
            raise

    def release(self) -> None:
        if not self._acquired:
            raise DatasetLockError("Dataset lock instance is not acquired")

        try:
            self._state.depth -= 1
            if self._state.depth == 0:
                file_descriptor = self._state.file_descriptor
                self._state.file_descriptor = None
                if file_descriptor is not None:
                    if fcntl is not None:
                        fcntl.flock(file_descriptor, fcntl.LOCK_UN)
                    os.close(file_descriptor)
        finally:
            self._acquired = False
            self._state.mutex.release()

    def __enter__(self) -> DatasetWriteLock:
        self.acquire()
        return self

    def __exit__(
        self,
        exception_type: type[BaseException] | None,
        exception: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.release()
