@echo off
REM Invoice Engine Startup Script (Windows)

echo ======================================
echo Invoice Engine - High Performance Mode
echo ======================================

cd /d "%~dp0"

REM JVM Performance Options
set JVM_OPTS=-XX:+UseG1GC ^
-Xms4g -Xmx8g ^
-XX:MaxGCPauseMillis=200 ^
-XX:G1ReservePercent=15 ^
-XX:+UnlockExperimentalVMOptions ^
-XX:+UseStringDeduplication ^
-XX:+AlwaysPreTouch

REM Remote Debug Configuration (port 5501)
set DEBUG_OPTS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5501

REM Application Configuration
set APP_OPTS=-Dserver.port=5959 ^
-Dspring.profiles.active=dev ^
-Dlogging.config=./config/logback.xml

REM Combined Options
set JAVA_OPTS=%JVM_OPTS% %DEBUG_OPTS% %APP_OPTS%

echo Starting Invoice Engine...
echo Web Server Port: 5959
echo Remote Debug Port: 5501
echo Spring Profile: dev
echo Logging Config: ./config/logback.xml
echo.
echo Java Options: %JAVA_OPTS%
echo.

java %JAVA_OPTS% -jar target\invoice-engine-0.0.1-SNAPSHOT.jar

pause
