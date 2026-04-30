@echo off
setlocal enabledelayedexpansion

rem Usage:
rem   build.bat <version>            Build image tagged <version> + latest
rem   build.bat <version> --push     Build + push both tags to registry
rem
rem Produces: proinsight/crewmeld:<version>
rem           proinsight/crewmeld:latest

set "VERSION=%~1"
set "PUSH_FLAG=%~2"

if "%VERSION%"=="" (
    echo Usage: build.bat ^<version^> [--push^|-p]
    echo Example: build.bat 1.0.0
    echo          build.bat 1.0.0 --push
    exit /b 1
)

echo %VERSION%| findstr /R "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$" >nul
if errorlevel 1 (
    echo ERROR: version must be semantic format x.y.z (got: %VERSION%^)
    exit /b 1
)

set "IMAGE=proinsight/crewmeld"
set "PUSH=0"
if /I "%PUSH_FLAG%"=="--push" set "PUSH=1"
if /I "%PUSH_FLAG%"=="-p"     set "PUSH=1"

echo [build.bat] Bundling socket server (bun build)...
pushd apps\crewmeld
call bun run build:socket
if errorlevel 1 (
    popd
    echo ERROR: socket bundle failed
    exit /b 1
)
popd

echo [build.bat] Building %IMAGE%:%VERSION%
set "VERSION=%VERSION%"
docker compose build crewmeld
if errorlevel 1 (
    echo ERROR: docker compose build failed
    exit /b 1
)

echo [build.bat] Tagging %IMAGE%:%VERSION% as %IMAGE%:latest
docker tag "%IMAGE%:%VERSION%" "%IMAGE%:latest"
if errorlevel 1 (
    echo ERROR: docker tag failed
    exit /b 1
)

if "%PUSH%"=="1" (
    echo [build.bat] Pushing %IMAGE%:%VERSION%
    docker push "%IMAGE%:%VERSION%"
    if errorlevel 1 (
        echo ERROR: docker push ^<version^> failed
        exit /b 1
    )
    echo [build.bat] Pushing %IMAGE%:latest
    docker push "%IMAGE%:latest"
    if errorlevel 1 (
        echo ERROR: docker push latest failed
        exit /b 1
    )
    echo [build.bat] Done: built + tagged + pushed %IMAGE%:%VERSION% / :latest
) else (
    echo [build.bat] Done: built + tagged %IMAGE%:%VERSION% / :latest ^(not pushed^)
    echo [build.bat] To push: build.bat %VERSION% --push
)

endlocal
exit /b 0
