#!/bin/bash
cd `dirname $0`
exitCode=0
for i in {1..5}
do
    node ./main.js $@
    exitCode=$?
    if [ $exitCode -eq 0 ];
    then
        break
    fi
    echo "程序意外退出, 返回代码: "$exitCode", 将在 5 秒后再次尝试启动, 第 "$i" 次重试"
    espeak -v zh "程序意外退出-返回代码-"$exitCode"-将在5秒后再次尝试启动-第"$i"次重试"
    sleep 5
done