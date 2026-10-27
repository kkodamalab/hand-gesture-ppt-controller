import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/gesture.js':['gesture.js','text/javascript'],'/style.css':['style.css','text/css']};
http.createServer(async(req,res)=>{const file=files[new URL(req.url,'http://localhost').pathname];if(!file){res.writeHead(404).end();return;}try{res.writeHead(200,{'Content-Type':file[1]+'; charset=utf-8'}).end(await readFile(new URL('../web/'+file[0],import.meta.url)));}catch{res.writeHead(500).end();}}).listen(8000,'127.0.0.1',()=>console.log('http://127.0.0.1:8000'));
