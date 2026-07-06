import re


def normalize_phone(phone: str) -> str:
    """Strip formatting and leading zeros/plus so numbers can be compared."""
    digits = re.sub(r"\D", "", phone or "")
    # Drop a single leading 0 used by some local formats (e.g. 0912… → 912…)
    if digits.startswith("0") and len(digits) > 10:
        digits = digits[1:]
    return digits


def phones_match(a: str, b: str) -> bool:
    """Return True when two phone strings refer to the same subscriber."""
    na, nb = normalize_phone(a), normalize_phone(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    # Handle missing country code on one side (e.g. 63912… vs 912…)
    return na.endswith(nb) or nb.endswith(na)
