"""Singularity project model, independent of CLI and UI."""

from .model import empty_model, validate, ModelError
from .storage import Store
from .service import apply

__all__ = ["empty_model", "validate", "ModelError", "Store", "apply"]
