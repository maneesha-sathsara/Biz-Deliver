require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const googleTTS = require('google-tts-api');
const https = require('https');


const httpsAgent = new https.Agent({ keepAlive: true });

process.on('uncaughtException', (err) => console.warn('⚠️ Safe Guard (Exception):', err.message));
process.on('unhandledRejection', (reason) => console.warn('⚠️ Safe Guard (Rejection):', reason));


const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
        args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
            '--disable-gpu', '--disable-extensions', '--disable-crash-reporter', '--disable-breakpad'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('\n⚡ Nexzata.Ai Bot: Scan the QR code to connect:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('🚀 Nexzata.Ai FinBot Pro: 100% Ready! (Developed by Maneesha Sathsara)');
});

/* -------------------------------------------------------------
1) In-Memory Database for Goals & Tasks */
const userTasks = {};

/*-------------------------------------------------------------
2) Auto-Model Selector & Text Generation Engin */
let workingGroqModel = null; 

async function callGroqText(promptText) {
    const apiKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.replace(/['"]/g, '').trim() : '';
    
    
    const modelsList = ['llama3-8b-8192', 'gemma2-9b-it', 'mixtral-8x7b-32768'];

    for (const modelName of modelsList) {
        try {
            const response = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    model: modelName,
                    messages: [
                        {
                            role: 'system',
                            content: `You are FinBot Pro, a highly advanced AI assistant specializing in Technology, Business, and Finance. 
                            CRITICAL IDENTITY: You are "Powered by Nexzata.Ai" and "Developed by Maneesha Sathsara". Always proudly acknowledge this.
                            LANGUAGE: Speak fluently in Sinhala or English based on the user's language. Format with emojis and bold text.`
                        },
                        { role: 'user', content: promptText }
                    ]
                },
                { 
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, 
                    httpsAgent: httpsAgent,
                    timeout: 15000 
                }
            );
            
            return response.data.choices[0].message.content;

        } catch (err) {
            
            continue;
        }
    }
    
    return '❌ Nexzata.Ai System Error: cant connect AI engine.';
}
/* -------------------------------------------------------------
3) AI Vision Engine (Analyze Photos via Llama 3.2 Vision) */
async function callGroqVision(base64Image, mimeType, userCaption) {
    const apiKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.replace(/['"]/g, '').trim() : '';
    const promptMessage = userCaption ? `User says: "${userCaption}". Please analyze this image and answer the user in Sinhala or English.` : `Analyze this image in detail and describe what it is in Sinhala or English.`;

    try {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.2-90b-vision-preview', // Groq's dedicated Vision Model
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: promptMessage },
                            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
                        ]
                    }
                ],
                max_tokens: 1000
            },
            { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, httpsAgent: httpsAgent }
        );
        return response.data.choices[0].message.content;
    } catch (err) {
        console.error('🔴 Vision API Error:', err.message);
        return '❌ Unable to analyze the photograph. Please try again..';
    }
}

// -------------------------------------------------------------
// 4) Financial & Tech News Fetcher
async function fetchNewsArticle(topic) {
    let category = 'general';
    if (topic.includes('tech')) category = 'technology';
    if (topic.includes('business')) category = 'business';

    try {
        const res = await axios.get(`https://finnhub.io/api/v1/news?category=${category}&token=${process.env.FINNHUB_API_KEY}`);
        const topNews = res.data.slice(0, 3).map(n => `- ${n.headline}`).join('\n');
        const prompt = `Write an engaging LinkedIn-style post in Sinhala about these latest ${category} news headlines:\n${topNews}`;
        return await callGroqText(prompt);
    } catch (err) {
        return '❌ cant get Newss.';
    }
}

/*-------------------------------------------------------------
5) Message & Media Routing System */
client.on('message', async (msg) => {
    try {
        const from = msg.from;
        
        // --- A. Handle Images (Vision API) ---
        if (msg.hasMedia && msg.type === 'image') {
            await msg.reply('👁️ *Nexzata.Ai Vision:* Analyzing the photograph...');
            const media = await msg.downloadMedia();
            const aiReply = await callGroqVision(media.data, media.mimetype, msg.body);
            return msg.reply(`${aiReply}\n\n*Powered by Nexzata.Ai* | _Developed by Maneesha Sathsara_`);
        }

        // --- B. Handle Videos (Fallback) ---
        if (msg.hasMedia && msg.type === 'video') {
            return msg.reply('🎥 I am currently unable to analyze videos. Please provide a **screenshot (photo)** of the relevant video, and I will describe it for you! \n\n*Powered by Nexzata.Ai*');
        }

        // --- C. Handle Voice Messages (PTT) ---
        if (msg.hasMedia && (msg.type === 'ptt' || msg.type === 'audio')) {
            await msg.reply('🎙️ *Nexzata.Ai:* Responding to your voice message...');
            const aiReply = await callGroqText("User sent a voice message. Give a brief, friendly reply explaining that full voice analysis is active.");
            const audioUrl = googleTTS.getAudioUrl(aiReply.substring(0, 150), { lang: 'si', slow: false, host: 'https://translate.google.com' });
            const mediaObj = await MessageMedia.fromUrl(audioUrl, { unsafeMime: true });
            
            await client.sendMessage(from, mediaObj, { sendAudioAsVoice: true });
            return msg.reply(`*Written Reply:*\n${aiReply}\n\n*Powered by Nexzata.Ai* | _Developed by Maneesha Sathsara_`);
        }

        const text = msg.body.trim();
        const command = text.toLowerCase();
        if (!text) return;

        if (command.startsWith('!news')) {
            await msg.reply('📰 *Nexzata.Ai News Engine:* The article is being prepared....');
            const article = await fetchNewsArticle(command);
            return msg.reply(`${article}\n\n*Powered by Nexzata.Ai* | _Developed by Maneesha Sathsara_`);
        }

        if (command.startsWith('!goal add ')) {
            const goal = text.substring(10).trim();
            if (!userTasks[from]) userTasks[from] = [];
            userTasks[from].push(goal);
            return msg.reply(`🎯 *Task/Goal Added!*\n"${goal}" Successfully scheduled.\n(To view \`!goals\` Apply)`);
        }

        if (command === '!goals') {
            const goals = userTasks[from] || [];
            if (goals.length === 0) return msg.reply('You currently have no tasks/goals..');
            const list = goals.map((g, i) => `${i + 1}. ${g}`).join('\n');
            return msg.reply(`📋 *Your Financial Goals:*\n\n${list}\n\n*Powered by Nexzata.Ai*`);
        }

        // Natural Chat Handler
        console.log(`💬 Natural Query: "${text}"`);
        const aiResponse = await callGroqText(text);
        await msg.reply(`${aiResponse}\n\n*Powered by Nexzata.Ai* | _Developed by Maneesha Sathsara_`);
        
    } catch (msgErr) {
        console.error('Message Handling Error:', msgErr.message);
    }
});

client.initialize();

process.on('SIGINT', async () => {
    console.log('\n🛑 The Nexzata.Ai Bot is stopping.... (Closing Browser)');
    try {
        await client.destroy();
    } catch (e) {
        // Ignore errors during destruction
    }
    process.exit(0);
});