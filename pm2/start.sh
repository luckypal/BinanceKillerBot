npm install

curl http://127.0.0.1/save

pm2 delete all

npm run build

pm2 start pm2/start.json
