import os
import sys
from typing import List

# Required environment variables for production
REQUIRED_VARS = [
    "POSTGRES_PASSWORD",
    "JWT_SECRET_KEY",
    "CORS_ORIGINS",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "NEXT_PUBLIC_API_URL",
    "DOMAIN",
    "ACME_EMAIL"
]

def validate_env():
    missing = []
    for var in REQUIRED_VARS:
        if not os.environ.get(var):
            missing.append(var)
    
    if missing:
        print("❌ Error: Missing required environment variables for production:")
        for var in missing:
            print(f"  - {var}")
        sys.exit(1)
    
    print("✅ All required environment variables are set.")

if __name__ == "__main__":
    # In practice, you'd load the .env.production file here
    # For now, this is a skeleton for the CI/CD or deployment script
    validate_env()
