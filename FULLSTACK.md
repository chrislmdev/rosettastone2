# Full-Stack Runtime

This repository now includes a starter full-stack runtime for monthly catalog persistence and reporting.

## Services

- `web`: static frontend served by Nginx on `http://localhost:8080`
- `api`: Express API on `http://localhost:3001`
- `db`: PostgreSQL 16 on `localhost:5432`

## Start

```powershell
docker compose up --build
```

## API endpoints

- `GET /health`
- `GET /imports`
- `GET /pricing?csp=aws&q=ec2`
- `GET /exceptions?csp=azure`
- `GET /changes?csp=gcp`

## Database tables

- `catalog_import`
- `pricing_item`
- `parent_service`
- `exception_item`
- `change_log`
