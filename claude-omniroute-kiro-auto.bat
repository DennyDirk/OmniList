@echo off
setlocal

REM ============================================================
REM Claude Code -> OmniRoute -> Kiro AI
REM Robust mode: let Kiro choose an actually available model.
REM ============================================================

set "OMNIROUTE_URL=http://localhost:20128/v1"

REM IMPORTANT:
REM Put a NEW OmniRoute API key here.
REM The previous key was exposed in chat, so rotate it first.
set "OMNIROUTE_KEY=sk-c37e33dbe92f5a71-b2e8b4-8d83f7ec"

REM Recommended robust Kiro route.
set "MODEL=kr/claude-haiku-4.5

REM If you want to force Sonnet instead, try this AFTER updating OmniRoute:
REM set "MODEL=kr/claude-haiku-4.5

set "ANTHROPIC_BASE_URL=%OMNIROUTE_URL%"
set "ANTHROPIC_AUTH_TOKEN=%OMNIROUTE_KEY%"
set "ANTHROPIC_API_KEY="

REM Force Claude Code through this exact OmniRoute route.
set "ANTHROPIC_MODEL=%MODEL%"
set "ANTHROPIC_DEFAULT_SONNET_MODEL=%MODEL%"


set "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1"

echo.
echo ============================================================
echo   Claude Code via OmniRoute / Kiro AI
echo ============================================================
echo Base URL : %ANTHROPIC_BASE_URL%
echo Model    : %ANTHROPIC_MODEL%
echo Provider : Kiro AI (kr)
echo ============================================================
echo.

REM Quick gateway health check.
curl -s --max-time 2 "%OMNIROUTE_URL%/health" >nul 2>&1
if errorlevel 1 (
    echo [WARN] OmniRoute did not answer on %OMNIROUTE_URL%
    echo.
)

claude %*

set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
