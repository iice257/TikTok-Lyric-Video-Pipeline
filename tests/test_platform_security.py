from tiktok_platform.security import hash_password, verify_password


def test_password_hash_round_trip() -> None:
    encoded = hash_password("secret-pass")
    assert encoded.startswith("pbkdf2_sha256$")
    assert verify_password("secret-pass", encoded) is True
    assert verify_password("wrong-pass", encoded) is False
