SETLOCAL
SET JAVA_HOME=%JAVA_HOME25%
SET PATH=%JAVA_HOME%\bin;%PATH%
title Xhtml2Pdf
color 2f
cls

java -Xmx512M -Xms256M ^
     -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:6501 ^
     -Dspring.profiles.active=dev ^
	 -Dlogging.config=./config/logback.xml ^
	 -Dserver.port=6969 ^
	 --sun-misc-unsafe-memory-access=allow ^
	 -jar ./target/xhtml2pdf-0.0.1-SNAPSHOT.jar
