const http = require("http");
const fs = require("fs");

function startServer(port) {
    return http
        .createServer((req, res) => {
            fs.readFile("./src/index.html", (err, data) => {
                if (err) {
                    console.error(err);
                    res.statusCode = 500;
                    res.end("Internal Server Error");
                    return;
                }

                res.setHeader("Content-Type", "text/html");
                res.statusCode = 200;
                res.write(data);
                res.end();
            });
        })
        .listen(port, () => {
            console.log(`Server listening on port ${port}`);
        });
}

module.exports = createServer;
