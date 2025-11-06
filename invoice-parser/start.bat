SETLOCAL
SET JAVA_HOME=%JAVA_HOME25%
SET PATH=%JAVA_HOME%\bin;%PATH%
title Zip Parser
color 9f
cls

java -Xmx512M -Xms256M ^
     -Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=6501 ^
     -Dspring.profiles.active=dev ^
	 -Dlogging.config=./config/logback.xml ^
	 -Dserver.port=7979 ^
	 -jar ./target/invoice-parser-0.0.1-SNAPSHOT.jar
