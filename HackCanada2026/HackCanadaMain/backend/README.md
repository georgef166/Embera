# Firefighter HUD Backend

FastAPI control plane for the firefighter XR demo.

## Endpoints

- `GET /api/health` - backend health check
- `GET /api/sessions/demo-session` - current simulated incident snapshot
- `POST /api/sessions/demo-session/simulate` - advance the simulated incident state

## Run

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
