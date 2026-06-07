@echo off
echo StaySync 개발 서버 시작...

:: PostgreSQL + Redis (Docker)
echo [1/3] DB 및 Redis 시작...
docker-compose up -d db redis
timeout /t 5 /nobreak >nul

:: Backend
echo [2/3] FastAPI 백엔드 시작 (포트 8000)...
cd backend
if not exist .env (
    copy .env.example .env
    echo .env 파일이 생성되었습니다. 설정을 확인하세요.
)
if not exist venv (
    python -m venv venv
    call venv\Scripts\activate
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate
)
start "StaySync Backend" cmd /k "uvicorn app.main:app --reload --port 8000"
cd ..

:: Frontend
echo [3/3] Next.js 프론트엔드 시작 (포트 3000)...
cd frontend
if not exist .env.local (
    copy .env.local.example .env.local
)
if not exist node_modules (
    npm install
)
start "StaySync Frontend" cmd /k "npm run dev"
cd ..

echo.
echo ✅ 개발 서버 시작 완료!
echo    프론트엔드: http://localhost:3000
echo    백엔드 API: http://localhost:8000
echo    API 문서:   http://localhost:8000/docs
echo.
pause
