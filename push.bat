@echo off
cd /d %~dp0
echo Clearing any stale git locks...
if exist .git\HEAD.lock del /f .git\HEAD.lock
if exist .git\index.lock del /f .git\index.lock
echo Pushing to origin...
git push
pause
