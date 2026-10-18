@echo off
rem Doble clic para abrir celular-dev: ver tu sitio en el celular Android, con sus errores en la PC.
chcp 65001 >nul
title celular-dev

rem El paquete para repartir trae su propio Node en runtime\ (no hay que instalar nada).
rem Si no esta, se usa el Node instalado en la PC.
set "NODO=%~dp0runtime\node.exe"
if exist "%NODO%" goto arrancar

where node >nul 2>nul
if errorlevel 1 goto sin_node
set "NODO=node"
node -e "process.exit(+process.versions.node.split('.')[0] < 22 ? 1 : 0)"
if errorlevel 1 goto node_viejo

:arrancar
"%NODO%" "%~dp0celular-dev\bin\celular.mjs" %*
echo.
pause
exit /b

:sin_node
echo.
echo   No encontre Node.js en esta PC. celular-dev lo necesita para funcionar.
echo.
echo   Lo mas facil: baja celular-dev desde su pagina de descargas (Releases),
echo   que ya trae todo adentro. O instala Node de una de estas formas:
echo     - En una terminal:  winget install OpenJS.NodeJS.LTS
echo     - O desde https://nodejs.org (la version LTS)
echo.
pause
exit /b 1

:node_viejo
echo.
echo   Tu Node.js es muy viejo: celular-dev necesita la version 22 o mas nueva.
echo   Actualizalo con:  winget upgrade OpenJS.NodeJS.LTS   (o desde https://nodejs.org)
echo.
pause
exit /b 1
