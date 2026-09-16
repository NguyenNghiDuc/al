if (!localStorage.getItem('kikial-token')) {
    window.location.replace('./login.html');
}

const chatForm = document.querySelector('#chat-form');
const promptInput = document.querySelector('#prompt');
const messages = document.querySelector('#messages');
const welcome = document.querySelector('#welcome');
const sendButton = document.querySelector('#send');
const sidebar = document.querySelector('#sidebar');
const overlay = document.querySelector('#overlay');
const historyList = document.querySelector('#history');
const chatCount = document.querySelector('#chat-count');
const searchInput = document.querySelector('#search');
const newChatButton = document.querySelector('#new-chat');
const chatsStorageKey = 'kikial-chats';

let chats = JSON.parse(localStorage.getItem(chatsStorageKey) || '[]');
let currentChat = null;

const saveChats = () => {
    localStorage.setItem(chatsStorageKey, JSON.stringify(chats));
};

const renderHistory = (filter = '') => {
    const query = filter.trim().toLowerCase();
    historyList.innerHTML = '';
    const visibleChats = chats.filter((chat) => chat.title.toLowerCase().includes(query));
    chatCount.textContent = String(chats.length);

    visibleChats.forEach((chat) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = chat.id === currentChat?.id ? 'active' : '';
        item.textContent = chat.title;
        item.addEventListener('click', () => openChat(chat.id));
        historyList.append(item);
    });
};

const createChat = () => {
    const id = globalThis.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    currentChat = { id, title: 'Cuộc trò chuyện mới', messages: [] };
    chats = [currentChat, ...chats];
    saveChats();
    welcome.hidden = false;
    messages.replaceChildren();
    renderHistory(searchInput.value);
};

const openChat = (chatId) => {
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return;
    currentChat = chat;
    welcome.hidden = chat.messages.length > 0;
    messages.replaceChildren();
    chat.messages.forEach((message) => addMessage(message.text, message.type, false));
    renderHistory(searchInput.value);
};

const addMessage = (text, type, save = true) => {
    const article = document.createElement('article');
    article.className = `message ${type}`;
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    article.append(paragraph);
    messages.append(article);
    messages.scrollTop = messages.scrollHeight;

    if (save && currentChat) {
        currentChat.messages.push({ text, type });
        if (type === 'user' && currentChat.title === 'Cuộc trò chuyện mới') {
            currentChat.title = text.length > 32 ? `${text.slice(0, 32)}...` : text;
        }
        if (!chats.some((chat) => chat.id === currentChat.id)) chats.unshift(currentChat);
        saveChats();
        renderHistory(searchInput.value);
    }
};

const sendPrompt = async (prompt) => {
    if (!prompt) return;
    if (!currentChat) createChat();
    welcome.hidden = true;
    addMessage(prompt, 'user');
    promptInput.value = '';
    promptInput.style.height = 'auto';
    sendButton.disabled = true;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: prompt,
                history: currentChat.messages.map((message) => ({
                    role: message.type,
                    content: message.text
                }))
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        addMessage(result.answer, 'assistant');
    } catch {
        addMessage('Mình chưa thể trả lời lúc này. Vui lòng thử lại sau.', 'assistant');
    } finally {
        sendButton.disabled = true;
    }
};

chatForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    sendPrompt(promptInput.value.trim());
});

promptInput?.addEventListener('input', () => {
    sendButton.disabled = !promptInput.value.trim();
    promptInput.style.height = 'auto';
    promptInput.style.height = `${Math.min(promptInput.scrollHeight, 180)}px`;
});

document.querySelectorAll('.suggestion').forEach((suggestion) => {
    suggestion.addEventListener('click', () => {
        promptInput.value = suggestion.dataset.prompt;
        promptInput.dispatchEvent(new Event('input'));
        promptInput.focus();
    });
});

newChatButton?.addEventListener('click', createChat);
searchInput?.addEventListener('input', () => renderHistory(searchInput.value));

renderHistory();
if (chats.length > 0) openChat(chats[0].id);

document.querySelector('#open-menu')?.addEventListener('click', () => {
    sidebar.classList.add('is-open');
    overlay.hidden = false;
});

document.querySelector('#close-menu')?.addEventListener('click', () => {
    sidebar.classList.remove('is-open');
    overlay.hidden = true;
});

overlay?.addEventListener('click', () => {
    sidebar.classList.remove('is-open');
    overlay.hidden = true;
});
