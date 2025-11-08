SETLOCAL
SET JAVA_HOME=%JAVA_HOME25%
SET PATH=%JAVA_HOME%\bin;%PATH%
title Zip Parser
color 1f
cls

java -Xmx512M -Xms256M ^
     -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:7501 ^
     -Dspring.profiles.active=dev ^
	 -Dlogging.config=./config/logback.xml ^
	 -Dserver.port=7979 ^
	 --sun-misc-unsafe-memory-access=allow ^
	 -jar ./target/invoice-parser-0.0.1-SNAPSHOT.jar
