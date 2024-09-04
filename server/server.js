import express from 'express';
import  logger from '../command-handler/src/util/logger.js';

const app = express();
const log = logger();
const port = process.env.SERVER_PORT || 5000;

app.get('/', (req, res) => {
    res.sendStatus(200);
})

app.listen(port, () => {
    log.info(`The server is listening on port ${port}`)
})