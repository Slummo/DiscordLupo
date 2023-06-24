//TODO rewrite logic (keeping track of songs, queue ecc...)
//TODO add back command
//TODO add Spotify links support for both songs and playlists (search module) https://developer.spotify.com/dashboard
//TODO add shuffle and jump commands for queueing songs

const {
    AudioPlayerStatus,
    NoSubscriberBehavior,
    VoiceConnectionStatus,
    createAudioPlayer
} = require("@discordjs/voice");
const { video_info } = require("play-dl");

require("dotenv").config()

const {
    createClient,
    retrieveBotInfo,
    createConnection,
    search,
    parseVideoInfo,
    createResource,
    sendEmbed
} = require("./bot");

const client = createClient();

let botName, prefix, helpCommandList = "";

retrieveBotInfo().then(info => {
    botName = info.get("name");
    prefix = info.get("prefix");

    const parseHelpJSON = json => {
        const parseArr = arr => {
            result = "";
            for(const s of arr) {
                result += `${s}\n`
            }
            return result;
        };

        list = "";
        for (const [key, value] of Object.entries(json)) {
            list += `${key}: ${parseArr(value)}\n   `
        }
        return list;
    };

    helpCommandList = parseHelpJSON(info.get("help"));
});

let txtChannel;
let voiceChannel;
let connection;
let player;
let subscription;

let queue = [];
let currentSong = null;
const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"];
let showedSongs = [];
let previouseCommand;

client.on("ready", () => {
    console.log(`[+]${botName} started!`);
    checkIdle();
});

client.on("messageCreate", async msg => {
    const content = msg.content;
    const member = msg.member;
    txtChannel = msg.channel;
    voiceChannel = member.voice.channel;

    if (!content.startsWith(prefix) || msg.author.bot) return;

    const args = content.substring(prefix.length).split(" ");
    const command = args[0];

    switch(command) {
        case "play": {
            if(!voiceChannel) {
                sendEmbed(txtChannel, "Devi essere connesso ad un canale vocale", "Red");
                break;
            }

            if(!args[1]) {
                sendEmbed(txtChannel, "Inserisci il nome di un contenuto!", "Red");
                break;
            }

            previouseCommand = "play";
            console.log(`<${msg.author.username}> play ${args.slice(1).join(" ")}`);

            try {
                if(!connection) startConnection();

                const videos = await search(args.slice(1).join(" "));
                if(videos.length == 0) {
                    sendEmbed(txtChannel, "Non stati trovati risultati...", "Red");
                    break;
                }

                //eventually decide what track will be played
                const video = videos[0];
                const info = await video_info(video.url);

                checkPlayerState(info);
            } catch(error) {
                console.error(error);
            }

            break;
        }
        case "play-c": {
            if(!voiceChannel) {
                sendEmbed(txtChannel, "Devi essere connesso ad un canale vocale", "Red");
                break;
            }

            if(!args[1]) {
                sendEmbed(txtChannel, "Inserisci il nome di un contenuto!", "Red");
                break;
            }

            previouseCommand = "play-c";
            console.log(`<${msg.author.username}> play-c ${args.slice(1).join(" ")}`);

            try {
                if(!connection) startConnection();

                const videos = await search(args.slice(1).join(" "), 5);
                if(videos.length == 0) {
                    sendEmbed(txtChannel, "Non stati trovati risultati...", "Red");
                    break;
                }

                showedSongs = videos;

                let videosStr = "";

                videos.forEach((video, index) => {
                    const authorName = video.author && video.author.name ? video.author.name : "Unknown";
                    videosStr += `${index + 1}) **${video.title}** by **${authorName}** (${video.duration})\n`;
                });

                sendEmbed(txtChannel, videosStr, "Blue", "Opzioni").then(sentMsg => {
                    videos.forEach((video, index) => {
                        sentMsg.react(emojis[index]);
                    });
                });
            } catch(error) {
                console.error(error);
            }

            break;
        }
        case "play-u": {
            if(!voiceChannel) {
                sendEmbed(txtChannel, "Devi essere connesso ad un canale vocale", "Red");
                break;
            }

            if(!args[1]) {
                sendEmbed(txtChannel, "Inserisci il nome di un contenuto!", "Red");
                break;
            }

            previouseCommand = "play-u";
            console.log(`<${msg.author.username}> play-u ${args.slice(1).join(" ")}`);


            try {
                if(!connection) startConnection();

                //eventually decide what track will be played
                const info = await video_info(args[1]);
                checkPlayerState(info);
            } catch(error) {
                console.error(error);
            }

            break;
        }
        case "np": {
            previouseCommand = "np";
            console.log(`<${msg.author.username}> np`);

            //check if a song is currently playing
            if (player && player.state.status === AudioPlayerStatus.Playing && currentSong) {
                const parsedInfo = parseVideoInfo(currentSong);
                sendEmbed(
                    txtChannel, 
                    `Now playing **${parsedInfo[0]}** by **${parsedInfo[1]}** (${parsedInfo[2]})`,
                    "Blue",
                    null,
                    currentSong.video_details.thumbnails.at(0).url
                );
            } else sendEmbed(txtChannel, "Non c'è nessun contenuto in riproduzione!", "Red");

            break;
        }
        case "pause": {
            if(!voiceChannel) {
                sendEmbed(txtChannel, "Devi essere connesso ad un canale vocale", "Red");
                break;
            }

            previouseCommand = "pause";
            console.log(`<${msg.author.username}> pause`);


            //check if a song is currently playing
            if (player && player.state.status === AudioPlayerStatus.Playing) {
                //pause the current song
                player.pause();
                sendEmbed(txtChannel, "Riproduzione messa in pausa!", "Blue");
            } else sendEmbed(txtChannel, "Non c'è nessun contenuto in riproduzione!", "Red");

            break;
        }
        case "unpause": {
            if(!voiceChannel) {
                sendEmbed(txtChannel, "Devi essere connesso ad un canale vocale", "Red");
                break;
            }

            previouseCommand = "unpause";
            console.log(`<${msg.author.username}> unpause`);

            //check if a song isn't currently playing and there's a song to play
            if (player && player.state.status === AudioPlayerStatus.Paused && currentSong) {
                //play the current song
                player.unpause();
                sendEmbed(txtChannel, "Riproduzione ripresa", "Blue");
            } else sendEmbed(txtChannel, "Non c'è nessun contenuto in riproduzione!", "Red");

            break;
        }
        case "skip": {
            if(!voiceChannel) {
                sendEmbed(txtChannel, "Devi essere connesso ad un canale vocale", "Red");
                break;
            }

            if(!currentSong) {
                sendEmbed(txtChannel, "Non c'è nessun contenuto da skippare!", "Red");
                break;
            }

            previouseCommand = "skip";
            console.log(`<${msg.author.username}> skip`);


            if (player && player.state.status === AudioPlayerStatus.Playing) {
                //stop the player
                player.stop();

                //skip to the next song in the queue
                playNextSong();
            }

            break;
        }
        case "back": {
            break;
        }
        case "queue": {
            if(!voiceChannel) {
                sendEmbed(txtChannel, "Devi essere connesso ad un canale vocale", "Red");
                break;
            }

            previouseCommand = "queue";
            console.log(`<${msg.author.username}> queue`);


            if(!currentSong) {
                sendEmbed(txtChannel, "La coda è vuota!", "Red");
                return;
            };

            const parsedInfo = parseVideoInfo(currentSong);
            let queueStr = `${1}) **${parsedInfo[0]}** by **${parsedInfo[1]}** (${parsedInfo[2]})`;

            queue.forEach((info, index) => {
                const parsedInfo = parseVideoInfo(info);
                queueStr += `\n${index + 2}) **${parsedInfo[0]}** by **${parsedInfo[1]}** (${parsedInfo[2]})`;
            });

            sendEmbed(txtChannel, queueStr, "Blue", "Queue");
            break;
        }
        case "leave": {
            if(VoiceConnectionStatus.Disconnected && queue.length != 0) {
                sendEmbed(txtChannel, "Il bot deve essere all'interno del canale per poterne uscire!", "Red");
                break;
            }

            previouseCommand = "leave";
            console.log(`<${msg.author.username}> leave`);

            stopConnection();

            sendEmbed(txtChannel, "Lupo è uscito!", "Blue");
            break;
        }
        case "help": {
                previouseCommand = "help";
                console.log(`<${msg.author.username}> help`);

                sendEmbed(txtChannel, helpCommandList, "Blue", "Comandi");
            break;
        }
    }
});

client.on("messageReactionAdd", async (reaction, user) => {
    if(user.bot || previouseCommand !== "play-c") return;

    let url;

    switch(reaction.emoji.name) {
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
        checkPlayerState(info);
    } catch(error) {
        console.error(error);
    }

    previouseCommand = "";

    // Remove all reactions from the message
    reaction.message.reactions.removeAll().catch(console.error);
});


//finally login
client.login(process.env.CLIENT_TOKEN || process.env["CLIENT_TOKEN"]);

//FUNCTIONS
function startConnection() {
    connection = createConnection(voiceChannel);
    player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Play
        }
    })
    subscription = connection.subscribe(player);
};

function stopConnection() {
    subscription.unsubscribe();
    connection.disconnect();
    connection = null;
    currentSong = null;
    queue = [];
    previouseShow = null;
}

async function playNextSong() {
    if (queue.length == 0) {
        sendEmbed(txtChannel, "La coda è vuota", "Red");
        currentSong = null;
        return;
    }

    const info = queue.shift();

    if(info) {
        const parsedInfo = parseVideoInfo(info);
        sendEmbed(txtChannel, 
            `Now playing **${parsedInfo[0]}** by **${parsedInfo[1]}** (${parsedInfo[2]})`,
            "Blue",
            null,
            info.video_details.thumbnails.at(0).url
        );

        currentSong = info;

        const resource = await createResource(info);
        if(resource) player.play(resource);
    }
}

async function checkIdle() {
    const timesToCheck = 450;
    let timesChecked = 0;

    while (true) {
        if ((player && player.state.status === AudioPlayerStatus.Idle) && queue && queue.length != 0) {
            //song ended, play the next song
            playNextSong();
        }
        
        if (player && player.state.status === AudioPlayerStatus.Playing) timesChecked = 0;

        //wait for 2 second before checking again
        await new Promise(resolve => {
            if(timesChecked == timesToCheck) {
                connection.destroy();
                connection = null;
            }
            setTimeout(resolve, 2000);
            timesChecked += 1;
        });
    }
}

function checkPlayerState(info) {
    const addToQueue = () => {
        queue.push(info);
        sendEmbed(txtChannel, 
            `Added **${info.video_details.title}** to the queue.`,
            "Blue",
            null,
            info.video_details.thumbnails.at(0).url
        );
    };

    const playSong = () => {
        queue.push(info);
        playNextSong();
    };

    //check if a song is currently playing
    if (player.state.status === AudioPlayerStatus.Playing) addToQueue();
    else if(player.state.status === AudioPlayerStatus.Paused) {
        //if its paused but theres a song to play
        if(currentSong) addToQueue();
        else playSong();
    }
    else if(player.state.status === AudioPlayerStatus.Idle) playSong();
}