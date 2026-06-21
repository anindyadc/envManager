import base64
import os
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def _derive_key(passphrase: str, salt: bytes | None = None) -> tuple[bytes, bytes]:
    if salt is None:
        salt = os.urandom(16)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=480000)
    key = base64.urlsafe_b64encode(kdf.derive(passphrase.encode()))
    return key, salt


class EncryptionService:
    def __init__(self, master_key: str):
        if master_key:
            # Use provided master key directly (must be 32-byte URL-safe base64)
            try:
                decoded = base64.urlsafe_b64decode(master_key + "==")
                if len(decoded) == 32:
                    self._fernet = Fernet(base64.urlsafe_b64encode(decoded))
                else:
                    self._fernet = self._fernet_from_passphrase(master_key)
            except Exception:
                self._fernet = self._fernet_from_passphrase(master_key)
        else:
            # Generate a deterministic key from a fixed salt (dev only)
            # In production ALWAYS set ENCRYPTION_KEY environment variable
            dev_passphrase = "dev-only-change-in-production"
            key, _ = _derive_key(dev_passphrase, salt=b"envmgr-dev-salt!")
            self._fernet = Fernet(key)

    def _fernet_from_passphrase(self, passphrase: str) -> Fernet:
        key, _ = _derive_key(passphrase, salt=b"envmgr-fix-salt!")
        return Fernet(key)

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        return self._fernet.decrypt(ciphertext.encode()).decode()

    def rotate_key(self, new_key: str, ciphertext: str) -> str:
        """Decrypt with current key, re-encrypt with new key."""
        plaintext = self.decrypt(ciphertext)
        new_service = EncryptionService(new_key)
        return new_service.encrypt(plaintext)


_encryption_service: EncryptionService | None = None


def get_encryption_service() -> EncryptionService:
    global _encryption_service
    if _encryption_service is None:
        from app.config import get_settings
        settings = get_settings()
        _encryption_service = EncryptionService(settings.encryption_key)
    return _encryption_service
