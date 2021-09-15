cd ~/bkiller/BinanceKillerBot

npm install

curl http://127.0.0.1/save

pm2 flush

npm run build

pm2 delete Binance-Killer-Bot

pm2 start pm2/start.json
