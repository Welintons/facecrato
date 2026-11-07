/* ==========================================================================
   1. IMPORTAÇÕES E CONFIGURAÇÕES INICIAIS
   ========================================================================== */
import { supabase } from "./supabase.js";

const postsContainer = document.getElementById("postsContainer");
const postContent = document.getElementById("postContent");
const visibility = document.getElementById("visibility");
const mediaInput = document.getElementById("mediaInput");
const filePreview = document.getElementById("filePreview");
const publishButton = document.getElementById("publishButton");

const menuToggleBtn = document.getElementById("menuToggleBtn");
const menuCloseBtn = document.getElementById("menuCloseBtn");
const mobileMenuDrawer = document.getElementById("mobileMenuDrawer");
const mobileMenuOverlay = document.getElementById("mobileMenuOverlay");

const notificationsButton = document.getElementById("notificationsButton");
const notifDropdown = document.getElementById("notifDropdown");
const notifDropdownList = document.getElementById("notifDropdownList");
const notifBadge = document.getElementById("notifBadge");
const loadMoreContainer = document.getElementById("loadMoreContainer");

const mediaModal = document.getElementById("mediaModal");
const closeMediaModal = document.getElementById("closeMediaModal");
const modalLeftPane = document.getElementById("modalLeftPane");
const modalMediaContainer = document.getElementById("modalMediaContainer");
const modalAuthorHeader = document.getElementById("modalAuthorHeader");
const modalPostContent = document.getElementById("modalPostContent");
const modalCommentsList = document.getElementById("modalCommentsList");
const loadMoreCommentsContainer = document.getElementById("loadMoreCommentsContainer");
const modalCommentForm = document.getElementById("modalCommentForm");
const modalCommentInput = document.getElementById("modalCommentInput");
const prevMediaBtn = document.getElementById("prevMediaBtn");
const nextMediaBtn = document.getElementById("nextMediaBtn");

const avatarModal = document.getElementById("avatarModal");
const modalAvatarImage = document.getElementById("modalAvatarImage");

let activeModalPost = null;
let activeMediaIndex = 0;
let modalCommentLimit = 3;
let notificationsChannel = null;
let postLimit = 10;
let globalPostsCache = [];

// CACHES EM MEMÓRIA PARA MÁXIMA VELOCIDADE (Evita requisições repetidas)
const storageUrlCache = new Map();
const avatarUrlCache = new Map();


/* ==========================================================================
   2. SISTEMA DE EFEITOS SONOROS (Web Audio API)
   ========================================================================== */
const soundFx = {
    ctx: null,
    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },
    playPop() {
        try {
            this.init();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.08);
        } catch(e) {}
    },
    playSuccess() {
        try {
            this.init();
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.1);
            osc.frequency.setValueAtTime(783.99, now + 0.2);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.35);
        } catch(e) {}
    },
    playNotification() {
        try {
            this.init();
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(1318.51, now + 0.12);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.4);
        } catch(e) {}
    }
};


/* ==========================================================================
   3. MENU MOBILE E INTERFACES DE TOPO
   ========================================================================== */
function toggleMobileMenu(open) {
    if (open) {
        mobileMenuOverlay.classList.remove("hidden");
        setTimeout(() => mobileMenuDrawer.classList.remove("translate-x-full"), 10);
    } else {
        mobileMenuDrawer.classList.add("translate-x-full");
        setTimeout(() => mobileMenuOverlay.classList.add("hidden"), 300);
    }
}

menuToggleBtn.addEventListener("click", () => toggleMobileMenu(true));
menuCloseBtn.addEventListener("click", () => toggleMobileMenu(false));
mobileMenuOverlay.addEventListener("click", () => toggleMobileMenu(false));

notificationsButton.addEventListener("click", (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle("hidden");
    if (!notifDropdown.classList.contains("hidden")) {
        fetchDropdownNotifications();
    }
});

document.addEventListener("click", (e) => {
    if (!notifDropdown.contains(e.target) && !notificationsButton.contains(e.target)) {
        notifDropdown.classList.add("hidden");
    }
});


/* ==========================================================================
   4. FUNÇÕES UTILITÁRIAS E SEGURANÇA (HTML Escape, RichText, Datas)
   ========================================================================== */
let currentUser = null;
let currentProfile = null;
let loadingFeed = false;

const reactionIcons = { like: "👍", love: "❤️", haha: "😂", wow: "😮", sad: "😢", angry: "😡" };

function escapeHTML(value = "") {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function formatRichText(text = "") {
    let safe = escapeHTML(text);
    safe = safe.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-cyan-600 underline font-semibold">$1</a>');
    safe = safe.replace(/#([a-zA-Z0-9_á-úÁ-Ú]+)/g, '<span class="text-cyan-600 font-bold">#$1</span>');
    safe = safe.replace(/@([a-zA-Z0-9_]+)/g, '<span class="text-violet-600 font-bold bg-violet-50 px-1.5 py-0.5 rounded">@$1</span>');
    return safe;
}

function initials(name = "F") {
    return name.trim().split(/\s+/).slice(0,2).map(p => p[0] || "").join("").toUpperCase();
}

function formatDate(date) {
    const d = new Date(date);
    if(isNaN(d)) return "";
    return new Intl.DateTimeFormat("pt-BR", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }).format(d);
}

function showError(text) { Swal.fire({ icon:"error", title:"Ops!", text }); }
function showSuccess(text) { Swal.fire({ toast:true, position:"top", icon:"success", title:text, showConfirmButton:false, timer:2200 }); }


/* ==========================================================================
   5. GERENCIAMENTO DE STORAGE E CACHE DE AVATARES
   ========================================================================== */
async function getStorageUrl(bucket, path) {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const cacheKey = `${bucket}:${path}`;
    if (storageUrlCache.has(cacheKey)) {
        const cached = storageUrlCache.get(cacheKey);
        if (cached.expires > Date.now()) return cached.url;
    }
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return null;
    storageUrlCache.set(cacheKey, { url: data.signedUrl, expires: Date.now() + 3000 * 1000 });
    return data.signedUrl;
}

// Cache global de avatares em memória para evitar reprocessamento
async function getCachedAvatarUrl(profile) {
    if (!profile || !profile.avatar_url) return null;
    const userId = profile.id;
    const avatarPath = profile.avatar_url;

    if (avatarUrlCache.has(userId)) {
        const cached = avatarUrlCache.get(userId);
        if (cached.path === avatarPath && cached.expires > Date.now()) {
            return cached.url;
        }
    }

    const url = await getStorageUrl("avatars", avatarPath);
    if (url) {
        avatarUrlCache.set(userId, { path: avatarPath, url, expires: Date.now() + 3000 * 1000 });
    }
    return url;
}

async function renderAvatar(profile, classes = "", onClickJs = "") {
    const name = profile?.full_name || profile?.username || "U";
    const avatarUrl = await getCachedAvatarUrl(profile);

    if (avatarUrl) {
        const clickAttr = onClickJs ? `onclick="${onClickJs}"` : `onclick="openAvatarModalFromUrl('${escapeHTML(avatarUrl)}')"`;
        return `<div class="${classes} overflow-hidden shrink-0 cursor-pointer hover:opacity-90 transition" ${clickAttr}><img src="${escapeHTML(avatarUrl)}" alt="${escapeHTML(name)}" class="w-full h-full object-cover" loading="lazy"></div>`;
    }
    const defaultClick = onClickJs ? `onclick="${onClickJs}"` : "";
    return `<div class="${classes} flex items-center justify-center font-bold shrink-0 cursor-pointer hover:opacity-90 transition bg-gradient-to-tr from-cyan-600 to-violet-600 text-white" ${defaultClick}>${escapeHTML(initials(name))}</div>`;
}

window.openAvatarModalFromUrl = function(url) {
    if (!url) return;
    modalAvatarImage.src = url;
    avatarModal.classList.remove("hidden");
    avatarModal.classList.add("flex");
    document.body.style.overflow = "hidden";
}

window.closeAvatarModal = function() {
    avatarModal.classList.add("hidden");
    avatarModal.classList.remove("flex");
    if (mediaModal.classList.contains("hidden")) {
        document.body.style.overflow = "auto";
    }
}


/* ==========================================================================
   6. INICIALIZAÇÃO DA SESSÃO E DADOS DO USUÁRIO
   ========================================================================== */
async function initialize() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) { window.location.replace("./login.html"); return; }
    currentUser = data.session.user;

    const { data: profile } = await supabase.from("profiles").select("id,username,full_name,avatar_url").eq("id", currentUser.id).maybeSingle();
    currentProfile = profile || { id: currentUser.id, username: currentUser.email?.split("@")[0] || "usuario", full_name: currentUser.email?.split("@")[0] || "Usuário" };

    document.getElementById("sideName").textContent = currentProfile.full_name || "Usuário";
    document.getElementById("sideUsername").textContent = "@" + (currentProfile.username || "usuario");
    
    document.getElementById("sideAvatar").innerHTML = await renderAvatar(currentProfile, "w-full h-full rounded-full", `window.location.href='./perfil.html'`);
    document.getElementById("composerAvatar").innerHTML = await renderAvatar(currentProfile, "w-full h-full rounded-full", `window.location.href='./perfil.html'`);

    document.getElementById("mobileMenuName").textContent = currentProfile.full_name || "Usuário";
    document.getElementById("mobileMenuUsername").textContent = "@" + (currentProfile.username || "usuario");
    document.getElementById("mobileMenuAvatar").innerHTML = await renderAvatar(currentProfile, "w-full h-full rounded-full", `window.location.href='./perfil.html'`);

    await loadFeed();
    await checkUnreadCount();
    subscribeNotifications();
}


/* ==========================================================================
   7. SISTEMA DE NOTIFICAÇÕES (Realtime)
   ========================================================================== */
async function checkUnreadCount() {
    const { count, error } = await supabase.from("notifications").select("*", { count: "exact", head: true }).eq("recipient_id", currentUser.id).eq("is_read", false);
    if (!error && count > 0) {
        notifBadge.textContent = count > 9 ? "9+" : count;
        notifBadge.classList.remove("hidden");
    } else {
        notifBadge.classList.add("hidden");
    }
}

async function subscribeNotifications() {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return;

    if (notificationsChannel) {
        supabase.removeChannel(notificationsChannel);
    }

    notificationsChannel = supabase.channel(`public:notifications:recipient_id=eq.${user.id}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `recipient_id=eq.${user.id}`
            },
            async () => {
                soundFx.playNotification();
                await fetchDropdownNotifications();
                await checkUnreadCount();
            }
        )
        .subscribe();
}

async function fetchDropdownNotifications() {
    const container = document.getElementById('notifDropdownList');
    if (!container) return;

    container.innerHTML = `<div class="p-5 text-center text-xs text-gray-400">Carregando notificações...</div>`;

    const { data: notifications, error } = await supabase
        .from('notifications')
        .select(`id, actor_id, notification_type, post_id, message, is_read, created_at, actor:profiles!notifications_actor_id_fkey (id, username, full_name, avatar_url)`)
        .eq('recipient_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(6);

    if (error || !notifications || notifications.length === 0) {
        container.innerHTML = `<div class="p-5 text-center text-xs text-gray-400">Nenhuma notificação por enquanto.</div>`;
        return;
    }

    try {
        const notificationsHTML = await Promise.all(
            notifications.map(async (n) => {
                const actor = n.actor || {};
                const actorName = actor.full_name || actor.username || "Alguém";
                const avatar = await renderAvatar(actor, 'w-8 h-8 rounded-full object-cover shrink-0');

                let actionText = "interagiu com você.";
                if (n.notification_type === "like") actionText = "curtiu sua publicação.";
                else if (n.notification_type === "comment") actionText = "comentou na sua publicação.";
                else if (n.notification_type === "friend_request") actionText = "enviou solicitação de amizade.";
                else if (n.notification_type === "friend_accepted") actionText = "aceitou sua amizade.";
                else if (n.message) actionText = n.message;

                const unreadClass = !n.is_read ? "bg-cyan-50/50 border-l-2 border-cyan-600" : "";
                let target = n.post_id ? `./feed.html?post=${encodeURIComponent(n.post_id)}` : "./perfil.html";

                return `
                    <a href="${target}" onclick="markOneReadModal('${n.id}')" class="flex items-start gap-3 p-3 hover:bg-gray-50 transition ${unreadClass}">
                        <div class="flex-shrink-0">${avatar || ''}</div>
                        <div class="flex-1 min-w-0">
                            <p class="text-xs text-slate-800 leading-relaxed break-words">
                                <strong class="font-bold text-slate-900">${escapeHTML(actorName)}</strong> ${escapeHTML(actionText)}
                            </p>
                            <span class="text-[10px] text-gray-400 mt-1 block">${formatDate(n.created_at)}</span>
                        </div>
                    </a>
                `;
            })
        );
        container.innerHTML = notificationsHTML.join('');
    } catch (err) {
        container.innerHTML = `<div class="p-5 text-center text-xs text-red-500">Erro ao carregar.</div>`;
    }
}

window.markOneReadModal = async function(id) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("recipient_id", currentUser.id);
    await checkUnreadCount();
}

window.markAllReadFromDropdown = async function() {
    await supabase.from("notifications").update({ is_read: true }).eq("recipient_id", currentUser.id).eq("is_read", false);
    await checkUnreadCount();
    await fetchDropdownNotifications();
}


/* ==========================================================================
   8. CARREGAMENTO E RENDERIZAÇÃO DO FEED DE POSTS
   ========================================================================== */
async function loadFeed() {
    if (loadingFeed) return;
    loadingFeed = true;

    try {
        let query = supabase.from("posts").select(`id, user_id, content, post_type, visibility, comments_permission, created_at, edited_at`).order("created_at", { ascending:false }).limit(postLimit);

        const { data: posts, error } = await query;
        if (error) throw error;

        if (!posts || posts.length === 0) {
            postsContainer.innerHTML = `<div class="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500"><i data-lucide="messages-square" class="w-10 h-10 mx-auto mb-3 text-gray-400"></i><strong class="block text-slate-800 text-base mb-1">Nenhuma publicação por aqui</strong><p class="text-xs">Quando houver publicações disponíveis no Cariri, elas aparecerão aqui.</p></div>`;
            loadMoreContainer.classList.add("hidden");
            lucide.createIcons();
            return;
        }

        if (posts.length >= postLimit) {
            loadMoreContainer.classList.remove("hidden");
        } else {
            loadMoreContainer.classList.add("hidden");
        }

        const postIds = posts.map(p => p.id);
        const userIds = [...new Set(posts.map(p => p.user_id))];

        const [profilesRes, mediaRes, reactionsRes, savedRes] = await Promise.all([
            supabase.from("profiles").select("id,username,full_name,avatar_url").in("id", userIds),
            supabase.from("post_media").select("id,post_id,media_url,media_type,position").in("post_id", postIds).order("position"),
            supabase.from("reactions").select("post_id,user_id,reaction_type").in("post_id", postIds),
            supabase.from("saved_posts").select("post_id").eq("user_id", currentUser.id).in("post_id", postIds)
        ]);

        const profileMap = Object.fromEntries((profilesRes.data || []).map(p => [p.id, p]));
        const mediaMap = {}; (mediaRes.data || []).forEach(m => { if (!mediaMap[m.post_id]) mediaMap[m.post_id] = []; mediaMap[m.post_id].push(m); });
        const reactionMap = {}; (reactionsRes.data || []).forEach(r => { if (!reactionMap[r.post_id]) reactionMap[r.post_id] = []; reactionMap[r.post_id].push(r); });
        const saved = new Set((savedRes.data || []).map(s => s.post_id));

        const prepared = await Promise.all(posts.map(async post => {
            const postMedia = mediaMap[post.id] || [];
            const signedMedia = await Promise.all(postMedia.map(async item => {
                const signedUrl = await getStorageUrl("post-media", item.media_url);
                return {...item, signedUrl};
            }));
            const { count: commentCount } = await supabase.from("comments").select("*", { count: "exact", head: true }).eq("post_id", post.id).is("parent_id", null);
            return { ...post, author: profileMap[post.user_id], media: signedMedia, reactions: reactionMap[post.id] || [], commentCount: commentCount || 0, saved: saved.has(post.id) };
        }));

        globalPostsCache = prepared;
        window.__faceCratoProfiles = profileMap;
        await renderPosts(prepared);
    } catch (error) {
        console.error("Erro feed:", error);
    } finally {
        loadingFeed = false;
    }
}

window.loadMorePosts = async function() {
    postLimit += 10;
    const btn = document.getElementById("loadMoreBtn");
    if(btn) btn.textContent = "Carregando...";
    await loadFeed();
    if(btn) btn.textContent = "Carregar publicações anteriores...";
}

async function renderPosts(posts) {
    const postHTMLs = await Promise.all(posts.map(async post => {
        const author = post.author || { full_name:"Usuário", username:"usuario" };
        const userReaction = post.reactions.find(r => r.user_id === currentUser.id);
        const reactionCount = post.reactions.length;
        const commentCount = post.commentCount;

        const reactionSummary = Object.entries(
            post.reactions.reduce((acc, r) => { acc[r.reaction_type] = (acc[r.reaction_type] || 0) + 1; return acc; }, {})
        ).map(([type, count]) => `${reactionIcons[type] || "👍"} ${count}`).join(" ");

        const mediaHTML = post.media.map((m, index) => {
            if (!m.signedUrl) return "";
            if (m.media_type === "video") return `
                <div class="relative w-full bg-black rounded-2xl overflow-hidden mb-4 border border-gray-200 shadow-inner group cursor-pointer" onclick="openMediaModal('${post.id}', ${index})">
                    <video class="w-full max-h-[520px] object-contain mx-auto pointer-events-none" preload="metadata"><source src="${escapeHTML(m.signedUrl)}"></video>
                    <div class="absolute inset-0 bg-black/20 hover:bg-black/0 transition flex items-center justify-center">
                        <div class="w-14 h-14 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition"><i data-lucide="play" class="w-7 h-7 ml-0.5 fill-current"></i></div>
                    </div>
                </div>`;
            return `
                <div class="overflow-hidden rounded-2xl mb-4 border border-gray-200 cursor-pointer group" onclick="openMediaModal('${post.id}', ${index})">
                    <img class="w-full max-h-[520px] object-cover bg-gray-100 group-hover:scale-[1.01] transition duration-300" src="${escapeHTML(m.signedUrl)}" alt="Mídia" loading="lazy">
                </div>`;
        }).join("");

        const authorAvatarHTML = await renderAvatar(author, "w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 text-white font-black flex items-center justify-center shrink-0 overflow-hidden", `window.location.href='./perfil.html?id=${escapeHTML(author.id || post.user_id)}'`);
        const visibilityLabel = { public:"Público", friends:"Amigos", private:"Privado" }[post.visibility] || "Público";

        const isOwner = post.user_id === currentUser.id;
        const ownerMenuHTML = isOwner ? `
            <div class="relative group/menu">
                <button class="p-2 text-gray-400 hover:text-slate-700 hover:bg-gray-50 rounded-xl transition" title="Opções">
                    <i data-lucide="more-vertical" class="w-4 h-4"></i>
                </button>
                <div class="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-xl shadow-xl hidden group-hover/menu:block z-20 py-1">
                    <button class="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-gray-50 flex items-center gap-2" data-action="edit-post"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Editar</button>
                    <button class="w-full text-left px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2" data-action="delete-post"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Excluir</button>
                </div>
            </div>
        ` : "";

        return `
            <article class="bg-white border border-gray-200 rounded-2xl p-5 mb-5 shadow-xs" data-post-id="${post.id}">
                <div class="flex items-center gap-3.5 mb-3">
                    ${authorAvatarHTML}
                    <div class="flex-1 min-w-0">
                        <a href="./perfil.html?id=${escapeHTML(author.id || post.user_id)}" class="block text-sm font-bold text-slate-900 hover:underline truncate">${escapeHTML(author.full_name || "Usuário")}</a>
                        <small class="text-xs text-gray-400">@${escapeHTML(author.username || "usuario")} · ${escapeHTML(formatDate(post.created_at))} · ${visibilityLabel}</small>
                    </div>
                    ${ownerMenuHTML}
                </div>

                ${post.content ? `<div class="text-slate-800 text-sm leading-relaxed mb-3 whitespace-pre-wrap break-words">${formatRichText(post.content)}</div>` : ""}
                ${mediaHTML}

                <div class="flex justify-between text-xs text-gray-500 py-2 border-b border-gray-100 mb-1" id="post-stats-${post.id}">
                    <span class="post-reaction-summary">${reactionSummary || " "}</span>
                    <span class="post-comment-count">${commentCount} comentário(s)</span>
                </div>

                <div class="grid grid-cols-3 gap-1 pt-1 relative">
                    <div class="reaction-wrapper">
                        <button class="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition ${userReaction ? 'text-cyan-600 bg-cyan-50' : ''}" data-action="like-click" id="like-btn-${post.id}">
                            <span class="like-icon">${userReaction ? reactionIcons[userReaction.reaction_type] : "👍"}</span>
                            <span class="like-text">${userReaction ? "Reagiu" : "Curtir"}</span> (<span class="like-count">${reactionCount}</span>)
                        </button>
                        <div class="reaction-popup" id="popup-${post.id}">
                            <button class="react-emoji-btn" data-reaction="like" data-post-id="${post.id}">👍</button>
                            <button class="react-emoji-btn" data-reaction="love" data-post-id="${post.id}">❤️</button>
                            <button class="react-emoji-btn" data-reaction="haha" data-post-id="${post.id}">😂</button>
                            <button class="react-emoji-btn" data-reaction="wow" data-post-id="${post.id}">😮</button>
                            <button class="react-emoji-btn" data-reaction="sad" data-post-id="${post.id}">😢</button>
                            <button class="react-emoji-btn" data-reaction="angry" data-post-id="${post.id}">😡</button>
                        </div>
                    </div>

                    <button class="flex items-center justify-center gap-2 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition" data-action="open-comments-modal">
                        <i data-lucide="message-circle" class="w-4 h-4"></i> Comentar
                    </button>

                    <button class="flex items-center justify-center gap-2 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition ${post.saved ? 'text-violet-600' : ''}" data-action="save-post">
                        <i data-lucide="bookmark" class="w-4 h-4"></i> ${post.saved ? "Salvo" : "Salvar"}
                    </button>
                </div>
            </article>
        `;
    }));

    postsContainer.innerHTML = postHTMLs.join("");
    lucide.createIcons();
}


/* ==========================================================================
   9. SISTEMA DE CURTIDAS E REAÇÕES (Atualização Instantânea Otimista)
   ========================================================================== */
function updatePostUIOptimistically(postId, newReactions) {
    const post = globalPostsCache.find(p => p.id === postId);
    if (!post) return;

    post.reactions = newReactions;
    const userReaction = post.reactions.find(r => r.user_id === currentUser.id);
    const reactionCount = post.reactions.length;

    const likeBtn = document.getElementById(`like-btn-${postId}`);
    if (likeBtn) {
        likeBtn.className = `w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition ${userReaction ? 'text-cyan-600 bg-cyan-50' : ''}`;
        likeBtn.querySelector(".like-icon").textContent = userReaction ? reactionIcons[userReaction.reaction_type] : "👍";
        likeBtn.querySelector(".like-text").textContent = userReaction ? "Reagiu" : "Curtir";
        likeBtn.querySelector(".like-count").textContent = reactionCount;
    }

    const statsContainer = document.getElementById(`post-stats-${postId}`);
    if (statsContainer) {
        const reactionSummary = Object.entries(
            post.reactions.reduce((acc, r) => { acc[r.reaction_type] = (acc[r.reaction_type] || 0) + 1; return acc; }, {})
        ).map(([type, count]) => `${reactionIcons[type] || "👍"} ${count}`).join(" ");
        
        statsContainer.querySelector(".post-reaction-summary").textContent = reactionSummary || " ";
    }
}

async function applyReaction(postId, reactionType) {
    document.querySelectorAll(".reaction-popup").forEach(p => p.classList.remove("show"));
    soundFx.playPop();

    const post = globalPostsCache.find(p => p.id === postId);
    if (post) {
        let currentReactions = [...post.reactions];
        const existingIndex = currentReactions.findIndex(r => r.user_id === currentUser.id);
        if (existingIndex !== -1) {
            if (currentReactions[existingIndex].reaction_type === reactionType) {
                currentReactions.splice(existingIndex, 1);
            } else {
                currentReactions.splice(existingIndex, 1);
                currentReactions.push({ post_id: postId, user_id: currentUser.id, reaction_type: reactionType });
            }
        } else {
            currentReactions.push({ post_id: postId, user_id: currentUser.id, reaction_type: reactionType });
        }
        updatePostUIOptimistically(postId, currentReactions);
    }

    const { data: existing } = await supabase.from("reactions").select("id,reaction_type").eq("post_id", postId).eq("user_id", currentUser.id).maybeSingle();

    if (existing) {
        if (existing.reaction_type === reactionType) {
            await supabase.from("reactions").delete().eq("post_id", postId).eq("user_id", currentUser.id);
        } else {
            await supabase.from("reactions").update({ reaction_type: reactionType }).eq("post_id", postId).eq("user_id", currentUser.id);
        }
    } else {
        await supabase.from("reactions").insert({ post_id: postId, user_id: currentUser.id, reaction_type: reactionType });
    }

    const { data: freshReactions } = await supabase.from("reactions").select("post_id,user_id,reaction_type").eq("post_id", postId);
    if (freshReactions) {
        updatePostUIOptimistically(postId, freshReactions);
    }
}


/* ==========================================================================
   10. MODAL DE MÍDIA, VÍDEO E COMENTÁRIOS
   ========================================================================== */
window.openCommentsModalOnly = function(postId) {
    const post = globalPostsCache.find(p => p.id === postId);
    if (!post) return;

    activeModalPost = post;
    activeMediaIndex = 0;
    modalCommentLimit = 3;

    modalLeftPane.classList.add("hidden");
    updateModalHeaderAndContent();
    loadAndRenderModalComments();
    mediaModal.classList.remove("hidden");
    mediaModal.classList.add("flex");
    document.body.style.overflow = "hidden";
}

window.openMediaModal = function(postId, mediaIndex = 0) {
    const post = globalPostsCache.find(p => p.id === postId);
    if (!post || !post.media || post.media.length === 0) return;

    activeModalPost = post;
    activeMediaIndex = mediaIndex;
    modalCommentLimit = 3;

    modalLeftPane.classList.remove("hidden");
    updateModalMediaContent();
    updateModalHeaderAndContent();
    loadAndRenderModalComments();
    mediaModal.classList.remove("hidden");
    mediaModal.classList.add("flex");
    document.body.style.overflow = "hidden";
}

function updateModalMediaContent() {
    if (!activeModalPost) return;
    const media = activeModalPost.media[activeMediaIndex];

    if (media.media_type === "video") {
        modalMediaContainer.innerHTML = `
            <div class="relative w-full h-full flex items-center justify-center bg-black group custom-video-wrapper">
                <video id="modalCustomVideo" class="max-w-full max-h-full object-contain mx-auto" preload="metadata"><source src="${escapeHTML(media.signedUrl)}"></video>
                <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-4 flex flex-col gap-2 opacity-90 group-hover:opacity-100 transition">
                    <div id="videoProgressContainer" class="w-full bg-white/30 h-1.5 rounded-full cursor-pointer relative overflow-hidden"><div id="videoProgressBar" class="bg-gradient-to-r from-cyan-500 to-violet-500 h-full w-0"></div></div>
                    <div class="flex items-center justify-between text-white text-xs">
                        <div class="flex items-center gap-3">
                            <button id="modalPlayPauseBtn" class="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 flex items-center justify-center hover:scale-105 transition shadow"><i data-lucide="play" class="w-4 h-4 fill-current ml-0.5" id="playPauseIcon"></i></button>
                            <span id="videoTimeDisplay">0:00 / 0:00</span>
                        </div>
                        <button id="modalFullscreenBtn" class="p-2 hover:bg-white/20 rounded-lg transition"><i data-lucide="maximize" class="w-4 h-4"></i></button>
                    </div>
                </div>
            </div>`;
        setupCustomVideoPlayer();
    } else {
        modalMediaContainer.innerHTML = `<img class="max-w-full max-h-full object-contain mx-auto select-none" src="${escapeHTML(media.signedUrl)}" alt="Mídia ampliada">`;
    }

    if (activeModalPost.media.length > 1) {
        prevMediaBtn.classList.toggle("hidden", activeMediaIndex === 0);
        nextMediaBtn.classList.toggle("hidden", activeMediaIndex === activeModalPost.media.length - 1);
    } else {
        prevMediaBtn.classList.add("hidden");
        nextMediaBtn.classList.add("hidden");
    }
}

async function updateModalHeaderAndContent() {
    if (!activeModalPost) return;
    const author = activeModalPost.author || { full_name: "Usuário", username: "usuario" };
    const authorAvatarHTML = await renderAvatar(author, "w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 text-white font-black flex items-center justify-center shrink-0 overflow-hidden", `window.location.href='./perfil.html?id=${escapeHTML(author.id || activeModalPost.user_id)}'`);
    
    modalAuthorHeader.innerHTML = `
        ${authorAvatarHTML}
        <div class="flex-1 min-w-0">
            <a href="./perfil.html?id=${escapeHTML(author.id || activeModalPost.user_id)}" class="block text-sm font-bold text-slate-900 hover:underline truncate">${escapeHTML(author.full_name || "Usuário")}</a>
            <small class="text-xs text-gray-400">@${escapeHTML(author.username || "usuario")} · ${escapeHTML(formatDate(activeModalPost.created_at))}</small>
        </div>
    `;

    modalPostContent.innerHTML = activeModalPost.content ? `<p class="text-slate-800 leading-relaxed whitespace-pre-wrap">${formatRichText(activeModalPost.content)}</p>` : `<span class="text-gray-400 italic">Sem legenda.</span>`;
    lucide.createIcons();
}

async function loadAndRenderModalComments() {
    if (!activeModalPost) return;
    const { data: comments, error, count } = await supabase
        .from("comments")
        .select("id, post_id, user_id, content, created_at", { count: "exact" })
        .eq("post_id", activeModalPost.id)
        .is("parent_id", null)
        .order("created_at", { ascending: true })
        .range(0, modalCommentLimit - 1);

    if (error || !comments || comments.length === 0) {
        modalCommentsList.innerHTML = `<div class="p-6 text-center text-xs text-gray-400">Nenhum comentário ainda. Seja o primeiro a comentar!</div>`;
        loadMoreCommentsContainer.classList.add("hidden");
        return;
    }

    const userIds = [...new Set(comments.map(c => c.user_id))];
    const missingUserIds = userIds.filter(id => !window.__faceCratoProfiles?.[id]);
    if (missingUserIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id,username,full_name,avatar_url").in("id", missingUserIds);
        (profiles || []).forEach(p => { window.__faceCratoProfiles[p.id] = p; });
    }

    const commentsHTMLs = await Promise.all(comments.map(async c => {
        const commentAuthor = window.__faceCratoProfiles?.[c.user_id] || { full_name: "Usuário", username: "usuario" };
        const commentAvatarHTML = await renderAvatar(commentAuthor, "w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 text-white text-xs", `window.location.href='./perfil.html?id=${escapeHTML(commentAuthor.id || c.user_id)}'`);
        return `
            <div class="flex gap-3 py-2">
                ${commentAvatarHTML}
                <div class="flex-1 bg-gray-50 border border-gray-100 p-3 rounded-2xl text-xs">
                    <a href="./perfil.html?id=${escapeHTML(commentAuthor.id || c.user_id)}" class="block text-cyan-700 font-bold hover:underline mb-1">${escapeHTML(commentAuthor.full_name || "Usuário")}</a>
                    <p class="text-slate-800 leading-relaxed">${formatRichText(c.content)}</p>
                </div>
            </div>
        `;
    }));

    modalCommentsList.innerHTML = commentsHTMLs.join("");
    if (count > modalCommentLimit) {
        loadMoreCommentsContainer.classList.remove("hidden");
    } else {
        loadMoreCommentsContainer.classList.add("hidden");
    }
}

window.loadMoreModalComments = async function() {
    modalCommentLimit += 5;
    await loadAndRenderModalComments();
}

function setupCustomVideoPlayer() {
    const video = document.getElementById("modalCustomVideo");
    const playBtn = document.getElementById("modalPlayPauseBtn");
    const progressBar = document.getElementById("videoProgressBar");
    const progressContainer = document.getElementById("videoProgressContainer");
    const timeDisplay = document.getElementById("videoTimeDisplay");
    const fullscreenBtn = document.getElementById("modalFullscreenBtn");

    if (!video) return;
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    video.addEventListener("loadedmetadata", () => { timeDisplay.textContent = `0:00 / ${formatTime(video.duration)}`; });

    function togglePlay() {
        if (video.paused) {
            video.play();
            playBtn.innerHTML = `<i data-lucide="pause" class="w-4 h-4 fill-current"></i>`;
        } else {
            video.pause();
            playBtn.innerHTML = `<i data-lucide="play" class="w-4 h-4 fill-current ml-0.5"></i>`;
        }
        lucide.createIcons();
    }

    playBtn.addEventListener("click", togglePlay);
    video.addEventListener("click", togglePlay);
    video.addEventListener("timeupdate", () => {
        if (!video.duration) return;
        progressBar.style.width = `${(video.currentTime / video.duration) * 100}%`;
        timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    });
    progressContainer.addEventListener("click", (e) => {
        const rect = progressContainer.getBoundingClientRect();
        video.currentTime = ((e.clientX - rect.left) / rect.width) * video.duration;
    });
    fullscreenBtn.addEventListener("click", () => { if (video.requestFullscreen) video.requestFullscreen(); });
}

prevMediaBtn.addEventListener("click", () => { if (activeMediaIndex > 0) { activeMediaIndex--; updateModalMediaContent(); } });
nextMediaBtn.addEventListener("click", () => { if (activeModalPost && activeMediaIndex < activeModalPost.media.length - 1) { activeMediaIndex++; updateModalMediaContent(); } });

closeMediaModal.addEventListener("click", closeModal);
mediaModal.addEventListener("click", (e) => { if (e.target === mediaModal) closeModal(); });

function closeModal() {
    mediaModal.classList.add("hidden");
    mediaModal.classList.remove("flex");
    document.body.style.overflow = "auto";
    modalMediaContainer.innerHTML = "";
    activeModalPost = null;
}

modalCommentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeModalPost) return;
    const content = modalCommentInput.value.trim();
    if (!content) return;

    soundFx.playPop();
    const { error } = await supabase.from("comments").insert({ post_id: activeModalPost.id, user_id: currentUser.id, content });
    if (!error) {
        modalCommentInput.value = "";
        await loadAndRenderModalComments();
        await loadFeed();
    }
});


/* ==========================================================================
   11. CRIAÇÃO, EDIÇÃO E EXCLUSÃO DE PUBLICAÇÕES
   ========================================================================== */
mediaInput.addEventListener("change", () => {
    const file = mediaInput.files[0];
    if (!file) { filePreview.classList.add("hidden"); return; }
    filePreview.classList.remove("hidden");
    filePreview.textContent = `Arquivo: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
});

async function compressAvatarImage(file) {
    return new Promise((resolve) => {
        if (!file.type.startsWith("image/")) { resolve(file); return; }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;
                const maxDim = 512;
                if (width > height) {
                    if (width > maxDim) { height *= maxDim / width; width = maxDim; }
                } else {
                    if (height > maxDim) { width *= maxDim / height; height = maxDim; }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: "image/webp" }));
                }, "image/webp", 0.78);
            };
            img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
    });
}

publishButton.addEventListener("click", async () => {
    const content = postContent.value.trim();
    const file = mediaInput.files[0];
    if (!content && !file) { showError("Escreva alguma coisa ou escolha um arquivo."); return; }

    publishButton.disabled = true;
    publishButton.textContent = "Publicando...";

    try {
        let processedFile = file;
        if (file && file.type.startsWith("image/")) {
            processedFile = await compressAvatarImage(file);
        }

        const postType = processedFile ? (processedFile.type.startsWith("video/") ? "video" : "photo") : "text";
        const { data: post, error: postErr } = await supabase.from("posts").insert({ user_id: currentUser.id, content, post_type: postType, visibility: visibility.value, comments_permission: "everyone" }).select("id").single();
        if (postErr) throw postErr;

        if (processedFile) {
            const ext = processedFile.name.split(".").pop();
            const filePath = `${currentUser.id}/${post.id}/${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabase.storage.from("post-media").upload(filePath, processedFile, { contentType: processedFile.type });
            if (upErr) throw upErr;
            await supabase.from("post_media").insert({ post_id: post.id, media_url: filePath, media_type: processedFile.type.startsWith("video/") ? "video" : "image", position: 0 });
        }

        postContent.value = ""; mediaInput.value = ""; filePreview.classList.add("hidden");
        soundFx.playSuccess();
        showSuccess("Publicado com sucesso!");
        await loadFeed();
    } catch (err) {
        showError(err.message || "Erro ao publicar.");
    } finally {
        publishButton.disabled = false;
        publishButton.textContent = "Publicar";
    }
});


/* ==========================================================================
   12. EVENT LISTENERS DO FEED (Cliques em botões, reações, menu de opções)
   ========================================================================== */
postsContainer.addEventListener("click", async event => {
    const target = event.target;
    const button = target.closest("[data-action]");
    const postElement = target.closest("[data-post-id]");
    
    if (target.classList.contains("react-emoji-btn")) {
        await applyReaction(target.dataset.postId, target.dataset.reaction);
        return;
    }

    if (!button || !postElement) return;
    const postId = postElement.dataset.postId;
    const action = button.dataset.action;

    if (action === "like-click") {
        const popup = document.getElementById(`popup-${postId}`);
        if (window.innerWidth <= 768) {
            const isVisible = popup.classList.contains("show");
            document.querySelectorAll(".reaction-popup").forEach(p => p.classList.remove("show"));
            if (!isVisible) popup.classList.add("show");
        } else {
            await applyReaction(postId, "like");
        }
        return;
    }

    if (action === "open-comments-modal") {
        openCommentsModalOnly(postId);
        return;
    }

    if (action === "save-post") {
        soundFx.playPop();
        const { data: existing } = await supabase.from("saved_posts").select("post_id").eq("post_id", postId).eq("user_id", currentUser.id).maybeSingle();
        if (existing) { await supabase.from("saved_posts").delete().eq("post_id", postId).eq("user_id", currentUser.id); }
        else { await supabase.from("saved_posts").insert({ post_id: postId, user_id: currentUser.id }); }
        await loadFeed();
    }

    if (action === "delete-post") {
        const confirm = await Swal.fire({ title:"Excluir publicação?", icon:"warning", showCancelButton:true, confirmButtonColor:"#dc2626", confirmButtonText:"Sim, excluir" });
        if (!confirm.isConfirmed) return;
        await supabase.from("posts").delete().eq("id", postId).eq("user_id", currentUser.id);
        showSuccess("Excluído com sucesso.");
        await loadFeed();
    }

    if (action === "edit-post") {
        const post = globalPostsCache.find(p => p.id === postId);
        if (!post) return;
        document.getElementById("editPostId").value = postId;
        document.getElementById("editPostContent").value = post.content || "";
        document.getElementById("editPostModal").classList.remove("hidden");
        document.getElementById("editPostModal").classList.add("flex");
    }
});

window.closeEditModal = function() {
    document.getElementById("editPostModal").classList.add("hidden");
    document.getElementById("editPostModal").classList.remove("flex");
}

window.submitEditPost = async function() {
    const postId = document.getElementById("editPostId").value;
    const content = document.getElementById("editPostContent").value.trim();
    if (!postId) return;

    const { error } = await supabase.from("posts").update({ content, edited_at: new Date().toISOString() }).eq("id", postId).eq("user_id", currentUser.id);
    if (!error) {
        closeEditModal();
        showSuccess("Publicação atualizada!");
        await loadFeed();
    } else {
        showError("Erro ao atualizar publicação.");
    }
}


/* ==========================================================================
   13. PERFIL E LOGOUT
   ========================================================================== */
document.getElementById("profileButton").addEventListener("click", () => window.location.href = "./perfil.html");

const handleLogout = async () => {
    const confirm = await Swal.fire({ title:"Sair da conta?", icon:"question", showCancelButton:true, confirmButtonColor:"#0891b2" });
    if (confirm.isConfirmed) { await supabase.auth.signOut(); window.location.replace("./login.html"); }
};

document.getElementById("logoutButtonMobile").addEventListener("click", handleLogout);


/* ==========================================================================
   14. START DA APLICAÇÃO
   ========================================================================== */
initialize();
