@echo off
SETLOCAL
IF DEFINED JAVA_HOME25 (
    SET JAVA_HOME=%JAVA_HOME25%
)
SET PATH=%JAVA_HOME%\bin;%PATH%

echo Running JMH Benchmarks...
java --sun-misc-unsafe-memory-access=allow --enable-native-access=ALL-UNNAMED -jar target/benchmarks.jar -rf json