function printDebugMessage(msg, error) {
    const now = new Date();
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    const second = String(now.getSeconds()).padStart(2, "0");

    const debugMsg = `[${hour}:${minute}:${second}] ${msg}`;

    error ? console.error(`{-} ${debugMsg}`) : console.log(`{+} ${debugMsg}`);
}

module.exports = printDebugMessage;
