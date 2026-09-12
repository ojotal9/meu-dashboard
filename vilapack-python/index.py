"""WSGI entry point used by Vercel. Configuration comes from project env vars."""
from app import create_app

app = create_app()
