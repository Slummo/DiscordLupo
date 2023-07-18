const { sendEmbed, parseVideoInfo } = require("./bot");
const printDebugMessage = require("./debug");

class Queue {
    constructor() {
        this.queue = [];
        this.currentSongIndex = 0;
    }

    add(info, txtChannel) {
        this.queue.push(info);
        sendEmbed(
            txtChannel,
            `Added **${info.video_details.title}** to the queue.`,
            "Blue",
            null,
            info.video_details.thumbnails.at(0).url
        );

        printDebugMessage("Song added to the queue!", false);
    }

    skip() {
        if (this.currentSongIndex < this.queue.length - 1) {
            this.currentSongIndex++;
        }
    }

    back() {
        if (this.currentSongIndex > 0) {
            this.currentSongIndex--;
        }
    }

    getCurrentSong() {
        return this.queue[this.currentSongIndex];
    }

    getLength() {
        return this.queue.length;
    }

    print(txtChannel) {
        if (!this.queue || this.queue.length == 0) {
            sendEmbed(txtChannel, "La coda è vuota!", "Red");
            return;
        }

        let queueStr = "";
        this.queue.forEach((info, index) => {
            const parsedInfo = parseVideoInfo(info);
            queueStr += `\n${index + 2}) **${parsedInfo[0]}** by **${
                parsedInfo[1]
            }** (${parsedInfo[2]})`;
        });

        sendEmbed(txtChannel, queueStr, "Blue", "Queue");
    }

    clear() {
        this.queue = [];
        this.currentSongIndex = 0;
    }
}

module.exports = Queue;
