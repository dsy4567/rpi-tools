#!/bin/bash
cd `dirname $0`
exitCode=0
timeout=5
rm ./data/musics/fallbackPlaylist.pls
for i in {1..3}
do
    node ./main.js $@
    exitCode=$?
    if [ $exitCode -eq 0 ];
    then
        exit 0
    fi
    echo "程序意外退出, 返回代码: "$exitCode", 将在 "$timeout" 秒后再次尝试启动, 第 "$i" 次重试"
    espeak -v zh "程序意外退出-返回代码-"$exitCode"-将在"$timeout"秒后再次尝试启动-第"$i"次重试"
    sleep 5
done
echo "重试次数过多, 尝试使用moc播放上一次播放列表"
espeak -v zh "重试次数过多-尝试使用moc播放上一次播放列表"
cd data
cp ./fallbackPlaylist.pls musics/fallbackPlaylist.pls
cd musics
mocp -S
sleep 3
mocp -a ./fallbackPlaylist.pls
sleep 3
mocp -p
