SETLOCAL
SET JAVA_HOME=%JAVA_HOME25%
SET PATH=%JAVA_HOME%\bin;%PATH%
title Invoice Processor
color 3f
cls

java -Xmx512M -Xms256M ^
     -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:8501 ^
     -Dspring.profiles.active=dev ^
	 -Dlogging.config=./config/logback.xml ^
	 -Dserver.port=8989 ^
	 --sun-misc-unsafe-memory-access=allow ^
	 -jar ./target/invoice-processor-0.0.1-SNAPSHOT.jar
