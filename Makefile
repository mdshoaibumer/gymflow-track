.PHONY: help dev-backend dev-frontend install-backend install-frontend migrate lint

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# === Development ===

dev-backend: ## Run backend dev server
	cd backend && uvicorn app.main:app --reload --port 8000

dev-frontend: ## Run frontend dev server
	cd frontend && npm run dev

# === Setup ===

install-backend: ## Install backend dependencies
	cd backend && pip install -r requirements.txt

install-frontend: ## Install frontend dependencies
	cd frontend && npm install

# === Database ===

migrate: ## Run database migrations
	cd backend && alembic upgrade head

migrate-create: ## Create new migration (usage: make migrate-create msg="description")
	cd backend && alembic revision --autogenerate -m "$(msg)"

# === Docker ===

up: ## Start all services
	docker-compose up -d

down: ## Stop all services
	docker-compose down

db-only: ## Start only database
	docker-compose up -d db

# === Quality ===

lint: ## Run linters
	cd backend && ruff check .
	cd frontend && npm run lint
