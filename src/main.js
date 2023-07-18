//Fix new logic (skip when queue has ended ecc...)
//TODO add playlists support
//TODO add Spotify links support for both songs and playlists (search module) https://developer.spotify.com/dashboard
//TODO add shuffle, jump commands for queueing songs

const {
    AudioPlayerStatus,
    NoSubscriberBehavior,
    createAudioPlayer,
} = require("@discordjs/voice");
const { video_info } = require("play-dl");

require("dotenv").config();

const {
    createClient,
    retrieveBotInfo,
    createConnection,
    search,
    searchLyrics,
    parseVideoInfo,
    createResource,
    sendEmbed,
} = require("./bot");

require("./server")(8888);

const Queue = require("./queue");

const printDebugMessage = require("./debug");

const client = createClient();

let botName,
    prefix,
    helpCommandList = "";

retrieveBotInfo()
    .then((info) => {
        botName = info.get("name");
        prefix = info.get("prefix");

        const parseHelpJSON = (json) => {
            const parseArr = (arr) => {
                result = "";
                for (const s of arr) {
                    result += `${s}\n`;
                }
                return result;
            };

            list = "";
            for (const [key, value] of Object.entries(json)) {
                list += `${key}: ${parseArr(value)}\n   `;
            }
            return list;
        };

        helpCommandList = parseHelpJSON(info.get("help"));
    })
    .catch((error) => {
        printDebugMessage(error.message, true);
    });

let args;
let txtChannel;
let voiceChannel;
let connection;
let player;
let subscription;

let queue = new Queue();
const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
let showedSongs = [];
let previouseCommand;

client.on("ready", () => {
    printDebugMessage(`${botName} started!`, false);
    checkStatus();
});

client.on("messageCreate", async (msg) => {
    const content = msg.content;
    const member = msg.member;
    txtChannel = msg.channel;
    voiceChannel = member.voice.channel;

    if (!content.startsWith(prefix) || msg.author.bot) return;

    args = content.substring(prefix.length).split(" ");

    const command = args[0];

    switch (command) {
        case "play":
        case "p": {
            printDebugMessage(
                `<${msg.author.username}> play ${args.slice(1).join(" ")}`,
                false
            );

            if (!connectedToVoiceChannel()) break;
            if (!isNameGiven()) break;

            previouseCommand = "play";

            try {
                if (!connection) startConnection();

                const videos = await search(args.slice(1).join(" "));
                checkVideos(videos);

                //eventually decide what track will be played
                const video = videos[0];
                const info = await video_info(video.url);

                queue.add(info, txtChannel);
            } catch (error) {
                printDebugMessage(error.message, true);
            }

            break;
        }
        case "play-c":
        case "pc": {
            printDebugMessage(
                `<${msg.author.username}> play-c ${args.slice(1).join(" ")}`,
                false
            );

            if (!connectedToVoiceChannel()) break;
            if (!isNameGiven()) break;

            previouseCommand = "play-c";

            try {
                if (!connection) startConnection();

                const videos = await search(args.slice(1).join(" "), 5);
                checkVideos(videos);

                showedSongs = videos;

                let videosStr = "";

                videos.forEach((video, index) => {
                    const authorName =
                        video.author && video.author.name
                            ? video.author.name
                            : "Unknown";
                    videosStr += `${index + 1}) **${
                        video.title
                    }** by **${authorName}** (${video.duration})\n`;
                });

                sendEmbed(txtChannel, videosStr, "Blue", "Opzioni").then(
                    (sentMsg) => {
                        videos.forEach((video, index) => {
                            sentMsg.react(emojis[index]);
                        });
                    }
                );
            } catch (error) {
                printDebugMessage(error.message, true);
            }

            break;
        }
        case "play-u":
        case "pu": {
            printDebugMessage(
                `<${msg.author.username}> play-u ${args.slice(1).join(" ")}`,
                false
            );

            if (!connectedToVoiceChannel()) break;
            if (!isNameGiven()) break;

            previouseCommand = "play-u";

            try {
                if (!connection) startConnection();

                //eventually decide what track will be played
                const info = await video_info(args[1]);
                queue.add(info, txtChannel);
            } catch (error) {
                printDebugMessage(error.message, true);
            }

            break;
        }
        case "now-playing":
        case "np": {
            printDebugMessage(`<${msg.author.username}> np`, false);

            previouseCommand = "np";

            //check if a song is currently playing
            let currentSong = queue.getCurrentSong();
            if (
                player &&
                player.state.status === AudioPlayerStatus.Playing &&
                currentSong
            ) {
                const parsedInfo = parseVideoInfo(currentSong);
                sendEmbed(
                    txtChannel,
                    `Now playing **${parsedInfo[0]}** by **${parsedInfo[1]}** (${parsedInfo[2]})`,
                    "Blue",
                    null,
                    currentSong.video_details.thumbnails.at(0).url
                );
            } else
                sendEmbed(
                    txtChannel,
                    "Non c'è nessun contenuto in riproduzione!",
                    "Red"
                );

            break;
        }
        case "pause":
        case "ps": {
            printDebugMessage(`<${msg.author.username}> pause`, false);

            if (!connectedToVoiceChannel()) break;

            previouseCommand = "pause";

            //check if a song is currently playing
            if (player && player.state.status === AudioPlayerStatus.Playing) {
                //pause the current song
                player.pause();
                sendEmbed(txtChannel, "Riproduzione messa in pausa!", "Blue");
            } else
                sendEmbed(
                    txtChannel,
                    "Non c'è nessun contenuto in riproduzione!",
                    "Red"
                );

            break;
        }
        case "unpause":
        case "ups": {
            printDebugMessage(`<${msg.author.username}> unpause`, false);

            if (!connectedToVoiceChannel()) break;

            previouseCommand = "unpause";

            //check if a song isn't currently playing and there's a song to play
            if (
                player &&
                player.state.status === AudioPlayerStatus.Paused &&
                queue.getCurrentSong()
            ) {
                //play the current song
                player.unpause();
                sendEmbed(txtChannel, "Riproduzione ripresa", "Blue");
            } else
                sendEmbed(
                    txtChannel,
                    "Non c'è nessun contenuto in riproduzione!",
                    "Red"
                );

            break;
        }
        case "skip":
        case "s": {
            printDebugMessage(`<${msg.author.username}> skip`, false);

            if (!connectedToVoiceChannel()) break;

            if (!queue.getCurrentSong()) {
                sendEmbed(
                    txtChannel,
                    "Non c'è nessun contenuto da skippare!",
                    "Red"
                );
                break;
            }

            previouseCommand = "skip";

            if (player && player.state.status === AudioPlayerStatus.Playing) {
                //stop the player
                player.stop();

                //skip to the next song in the queue
                queue.skip();
            }

            break;
        }
        case "back":
        case "b": {
            printDebugMessage(`<${msg.author.username}> back`, false);

            if (!connectedToVoiceChannel()) break;

            if (!queue.getCurrentSong()) {
                sendEmbed(
                    txtChannel,
                    "Non c'è nessun contenuto per poter tornare indietro!",
                    "Red"
                );
                break;
            }

            previouseCommand = "back";

            if (player && player.state.status === AudioPlayerStatus.Playing) {
                //stop the player
                player.stop();

                //skip to the next song in the queue
                queue.back();
            }
            break;
        }
        case "lyrics":
        case "l": {
            printDebugMessage(`<${msg.author.username}> lyrics`, false);

            if (!connectedToVoiceChannel()) break;

            if (!queue.getCurrentSong()) {
                sendEmbed(
                    txtChannel,
                    "Non c'è nessun contenuto di cui cercare le lyrics!",
                    "Red"
                );
                break;
            }

            previouseCommand = "lyrics";

            const parsedInfo = parseVideoInfo(queue.getCurrentSong());
            const token =
                process.env.GENIUS_TOKEN || process.env["GENIUS_TOKEN"];

            searchLyrics(token, parsedInfo[0], parsedInfo[1])
                .then((lyrics) => {
                    if (lyrics) sendEmbed(txtChannel, lyrics, "Blue");
                    else sendEmbed(txtChannel, "Lyrics not found", "Blue");
                })
                .catch((error) => {
                    printDebugMessage(error.message, true);
                });

            break;
        }
        case "queue":
        case "q": {
            printDebugMessage(`<${msg.author.username}> queue`, false);

            if (!connectedToVoiceChannel()) break;

            previouseCommand = "queue";

            queue.print(txtChannel);

            break;
        }
        case "leave": {
            printDebugMessage(`<${msg.author.username}> leave`, false);

            previouseCommand = "leave";

            if (stopConnection(txtChannel))
                sendEmbed(txtChannel, "Lupo è uscito!", "Blue");

            break;
        }
        case "help":
        case "h": {
            printDebugMessage(`<${msg.author.username}> help`, false);

            previouseCommand = "help";

            sendEmbed(txtChannel, helpCommandList, "Blue", "Comandi");
            break;
        }
    }
});

client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot || previouseCommand !== "play-c") return;

    let url;

    switch (reaction.emoji.name) {
        case emojis[0]: {
            url = showedSongs[0].url;
            break;
        }
        case emojis[1]: {
            url = showedSongs[1].url;
            break;
        }
        case emojis[2]: {
            url = showedSongs[2].url;
            break;
        }
        case emojis[3]: {
            url = showedSongs[3].url;
            break;
        }
        case emojis[4]: {
            url = showedSongs[4].url;
            break;
        }
    }

    try {
        const info = await video_info(url);
        queue.add(info, txtChannel);
    } catch (error) {
        printDebugMessage(error.message, true);
    }

    previouseCommand = "";

    // Remove all reactions from the message
    reaction.message.reactions
        .removeAll()
        .catch((error) => printDebugMessage(error.message, true));
});

//finally login
client.login(process.env.DISCORD_TOKEN || process.env["DISCORD_TOKEN"]);

//FUNCTIONS
function startConnection() {
    connection = createConnection(voiceChannel);
    player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Play,
        },
    });
    subscription = connection.subscribe(player);
}

function stopConnection(txtChannel) {
    try {
        if (!subscription || !connection) {
            sendEmbed(
                txtChannel,
                "Lupo non è connesso a nessun canale vocale",
                "Red"
            );
            return false;
        }
        subscription.unsubscribe();
        connection.disconnect();
        connection = null;
        queue.clear();
        previouseShow = null;

        return true;
    } catch (error) {
        printDebugMessage(error.message, true);
    }
}

function connectedToVoiceChannel() {
    if (!voiceChannel) {
        sendEmbed(
            txtChannel,
            "Devi essere connesso ad un canale vocale",
            "Red"
        );
        return false;
    } else return true;
}

function isNameGiven() {
    if (!args[1]) {
        sendEmbed(txtChannel, "Inserisci il nome di un contenuto!", "Red");
        return false;
    }
    return true;
}

function checkVideos(videos) {
    if (!videos || videos.length == 0) {
        sendEmbed(txtChannel, "Non stati trovati risultati...", "Red");
    }
}

async function playSong(info) {
    try {
        const parsedInfo = parseVideoInfo(info);
        sendEmbed(
            txtChannel,
            `Now playing **${parsedInfo[0]}** by **${parsedInfo[1]}** (${parsedInfo[2]})`,
            "Blue",
            null,
            info.video_details.thumbnails.at(0).url
        );

        const resource = await createResource(info);
        if (resource) player.play(resource);
    } catch (error) {
        printDebugMessage(error.message, true);
    }
}

async function checkStatus() {
    //450 times every 2 seconds = 15 minutes of idle
    const timesToCheck = 450;
    let timesChecked = 0;

    while (true) {
        if (
            player &&
            player.state.status === AudioPlayerStatus.Idle &&
            queue &&
            queue.getCurrentSong()
        ) {
            const info = queue.getCurrentSong();
            playSong(info);
        }

        if (player && player.state.status === AudioPlayerStatus.Playing)
            timesChecked = 0;

        //wait for 2 second before checking again
        await new Promise((resolve) => {
            if (timesChecked == timesToCheck) {
                if (connection) {
                    connection.destroy();
                    connection = null;
                }
                timesChecked = 0;
            }
            setTimeout(resolve, 2000);
            timesChecked += 1;
        });
    }
}
