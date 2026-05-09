#!/usr/bin/env python3
"""Quick API test script"""
import httpx
import json

BASE_URL = "http://localhost:8000"

try:
    # Test health check
    print("Testing health check...")
    response = httpx.get(f"{BASE_URL}/health", timeout=5)
    print(f"Health: {response.status_code}")
    print(response.json())
    
    # Test Swagger docs
    print("\nTesting Swagger docs availability...")
    response = httpx.get(f"{BASE_URL}/docs", timeout=5)
    print(f"Swagger docs: {response.status_code}")
    if response.status_code == 200:
        print("✅ Swagger docs are available at /docs")

    # Test auth register/login flow
    print("\nTesting auth registration and login...")
    register_payload = {
        "gym_name": "Test Gym",
        "owner_name": "Alice Smith",
        "phone": "9876543212",
        "email": "owner2@test.com",
        "password": "TestPass123",
        "city": "Mumbai",
    }
    response = httpx.post(
        f"{BASE_URL}/api/v1/auth/register",
        json=register_payload,
        timeout=10,
    )
    print(f"Register: {response.status_code}")
    print(response.text)

    if response.status_code == 201:
        login_payload = {
            "email": "owner2@test.com",
            "password": "TestPass123",
        }
        response = httpx.post(
            f"{BASE_URL}/api/v1/auth/login",
            json=login_payload,
            timeout=10,
        )
        print(f"Login: {response.status_code}")
        print(response.text)
        if response.status_code == 200:
            print("✅ Auth endpoints are working")

    print("\n✅ Backend is running successfully!")

except Exception as e:
    print(f"❌ Error: {e}")
