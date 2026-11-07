/* ==========================================================================
   1. IMPORTAÇÕES E SELETORES DE ELEMENTOS DO DOM
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
const modalMediaContainer = document.getElementById("modalMediaContainer");
const modalAuthorHeader = document.getElementById("modalAuthorHeader");
const modalPostContent = document.getElementById("modalPostContent");
const modalCommentsList = document.getElementById("modalCommentsList");
const modalCommentForm = document.getElementById("modalCommentForm");
const modalCommentInput = document.getElementById("modalCommentInput");
const prevMediaBtn = document.getElementById("prevMediaBtn");
const nextMediaBtn = document.getElementById("nextMediaBtn");

let activeModalPost = null;
let activeMediaIndex = 0;
let notificationsChannel = null;
let postLimit = 10;
let currentUser = null;
let currentProfile = null;
let currentFeed = "discover";
let loadingFeed = false;
let globalPostsCache = [];

const reactionIcons = { like: "👍", love: "❤️", haha: "😂", wow: "😮", sad: "😢", angry: "😡" };


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
   3. CONTROLE DO MENU MOBILE E INTERFACES DE NAVEGAÇÃO
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
   4. FUNÇÕES UTILITÁRIAS (Segurança HTML, RichText, Datas, Alertas)
   ========================================================================== */
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
   5. GERENCIAMENTO DE STORAGE E RENDERIZAÇÃO DE AVATARES
   ========================================================================== */
async function getStorageUrl(bucket, path) {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (error) return null;
    return data?.signedUrl || null;
}

async function renderAvatar(profile, classes = "") {
    const name = profile?.full_name || profile?.username || "U";
    const avatarPath = profile?.avatar_url;

    if (avatarPath) {
        const avatarUrl = await getStorageUrl("avatars", avatarPath);
        if (avatarUrl) {
            return `<div class="${classes} overflow-hidden shrink-0"><img src="${escapeHTML(avatarUrl)}" alt="${escapeHTML(name)}" class="w-full h-full object-cover" loading="lazy"></div>`;
        }
    }
    return `<div class="${classes} flex items-center justify-center font-bold shrink-0">${escapeHTML(initials(name))}</div>`;
}


/* ==========================================================================
   6. INICIALIZAÇÃO DA SESSÃO E DADOS DO USUÁRIO LOGADO
   ========================================================================== */
async function initialize() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) { window.location.replace("./login.html"); return; }
    currentUser = data.session.user;

    const { data: profile } = await supabase.from("profiles").select("id,username,full_name,avatar_url").eq("id", currentUser.id).maybeSingle();
    currentProfile = profile || { id: currentUser.id, username: currentUser.email?.split("@")[0] || "usuario", full_name: currentUser.email?.split("@")[0] || "Usuário" };

    document.getElementById("sideName").textContent = currentProfile.full_name || "Usuário";
    document.getElementById("sideUsername").textContent = "@" + (currentProfile.username || "usuario");
    
    document.getElementById("sideAvatar").innerHTML = await renderAvatar(currentProfile, "w-full h-full rounded-full");
    document.getElementById("composerAvatar").innerHTML = await renderAvatar(currentProfile, "w-full h-full rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 text-white");

    document.getElementById("mobileMenuName").textContent = currentProfile.full_name || "Usuário";
    document.getElementById("mobileMenuUsername").textContent = "@" + (currentProfile.username || "usuario");
    document.getElementById("mobileMenuAvatar").innerHTML = await renderAvatar(currentProfile, "w-full h-full rounded-full");

    await loadFeed();
    await checkUnreadCount();
    subscribeNotifications();
}


/* ==========================================================================
   7. SISTEMA DE NOTIFICAÇÕES (Contador e Tempo Real)
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
   8. BUSCA E CARREGAMENTO DO FEED (Posts, Mídias, Comentários e Curtidas)
   ========================================================================== */
async function getFriendIds() {
    const { data, error } = await supabase.from("friendships").select("user_a,user_b").eq("status", "accepted").or(`user_a.eq.${currentUser.id},user_b.eq.${currentUser.id}`);
    if (error) throw error;
    const ids = new Set([currentUser.id]);
    (data || []).forEach(f => ids.add(f.user_a === currentUser.id ? f.user_b : f.user_a));
    return [...ids];
}

async function loadFeed() {
    if (loadingFeed) return;
    loadingFeed = true;

    try {
        let query = supabase.from("posts").select(`id, user_id, content, post_type, visibility, comments_permission, created_at, edited_at`).order("created_at", { ascending:false }).limit(postLimit);
        if (currentFeed === "friends") query = query.in("user_id", await getFriendIds());

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

        const [profilesRes, mediaRes, reactionsRes, commentsRes, savedRes] = await Promise.all([
            supabase.from("profiles").select("id,username,full_name,avatar_url").in("id", userIds),
            supabase.from("post_media").select("id,post_id,media_url,media_type,position").in("post_id", postIds).order("position"),
            supabase.from("reactions").select("post_id,user_id,reaction_type").in("post_id", postIds),
            supabase.from("comments").select("id,post_id,user_id,content,created_at,parent_id").in("post_id", postIds).is("parent_id", null).order("created_at", { ascending:true }),
            supabase.from("saved_posts").select("post_id").eq("user_id", currentUser.id).in("post_id", postIds)
        ]);

        const profileMap = Object.fromEntries((profilesRes.data || []).map(p => [p.id, p]));
        const commentUserIds = [...new Set((commentsRes.data || []).map(c => c.user_id))].filter(id => !profileMap[id]);

        if (commentUserIds.length) {
            const { data: commentProfiles } = await supabase.from("profiles").select("id,username,full_name,avatar_url").in("id", commentUserIds);
            (commentProfiles || []).forEach(profile => { profileMap[profile.id] = profile; });
        }

        const mediaMap = {}; (mediaRes.data || []).forEach(m => { if (!mediaMap[m.post_id]) mediaMap[m.post_id] = []; mediaMap[m.post_id].push(m); });
        const commentsMap = {}; (commentsRes.data || []).forEach(c => { if (!commentsMap[c.post_id]) commentsMap[c.post_id] = []; commentsMap[c.post_id].push(c); });
        const reactionMap = {}; (reactionsRes.data || []).forEach(r => { if (!reactionMap[r.post_id]) reactionMap[r.post_id] = []; reactionMap[r.post_id].push(r); });
        const saved = new Set((savedRes.data || []).map(s => s.post_id));

        const prepared = await Promise.all(posts.map(async post => {
            const postMedia = mediaMap[post.id] || [];
            const signedMedia = await Promise.all(postMedia.map(async item => {
                const { data } = await supabase.storage.from("post-media").createSignedUrl(item.media_url, 3600);
                return {...item, signedUrl: data?.signedUrl || null};
            }));
            return { ...post, author: profileMap[post.user_id], media: signedMedia, reactions: reactionMap[post.id] || [], comments: commentsMap[post.id] || [], saved: saved.has(post.id) };
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


/* ==========================================================================
   9. RENDERIZAÇÃO VISUAL DOS POSTS NA TELA
   ========================================================================== */
async function renderPosts(posts) {
    const postHTMLs = await Promise.all(posts.map(async post => {
        const author = post.author || { full_name:"Usuário", username:"usuario" };
        const userReaction = post.reactions.find(r => r.user_id === currentUser.id);
        const reactionCount = post.reactions.length;
        const commentCount = post.comments.length;

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

        const commentsHTML = (await Promise.all(post.comments.map(async c => {
            const commentAuthor = window.__faceCratoProfiles?.[c.user_id] || { full_name: "Usuário", username: "usuario" };
            const commentAvatarHTML = await renderAvatar(commentAuthor, "w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 text-white text-[10px]");
            return `
                <div class="flex gap-2.5 my-2.5">
                    ${commentAvatarHTML}
                    <div class="flex-1 bg-gray-50 border border-gray-200 p-3 rounded-2xl text-xs">
                        <strong class="block text-cyan-700 font-bold mb-0.5">${escapeHTML(commentAuthor.full_name || "Usuário")}</strong>
                        <p class="text-slate-800 leading-relaxed">${formatRichText(c.content)}</p>
                    </div>
                </div>
            `;
        }))).join("");

        const authorAvatarHTML = await renderAvatar(author, "w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 text-white font-black flex items-center justify-center shrink-0 overflow-hidden");
        const visibilityLabel = { public:"Público", friends:"Amigos", private:"Privado" }[post.visibility] || "Público";

        return `
            <article class="bg-white border border-gray-200 rounded-2xl p-5 mb-5 shadow-xs" data-post-id="${post.id}">
                <div class="flex items-center gap-3.5 mb-3">
                    ${authorAvatarHTML}
                    <div class="flex-1 min-w-0">
                        <strong class="block text-sm font-bold text-slate-900">${escapeHTML(author.full_name || "Usuário")}</strong>
                        <small class="text-xs text-gray-400">@${escapeHTML(author.username || "usuario")} · ${escapeHTML(formatDate(post.created_at))} · ${visibilityLabel}</small>
                    </div>
                    ${post.user_id === currentUser.id ? `<button class="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-50 rounded-lg transition" data-action="delete-post" title="Excluir"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ""}
                </div>

                ${post.content ? `<div class="text-slate-800 text-sm leading-relaxed mb-3 whitespace-pre-wrap break-words">${formatRichText(post.content)}</div>` : ""}
                ${mediaHTML}

                <div class="flex justify-between text-xs text-gray-500 py-2 border-b border-gray-100 mb-1">
                    <span>${reactionSummary || " "}</span>
                    <span>${commentCount} comentário(s)</span>
                </div>

                <div class="grid grid-cols-3 gap-1 pt-1 relative">
                    <div class="reaction-wrapper">
                        <button class="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition ${userReaction ? 'text-cyan-600 bg-cyan-50' : ''}" data-action="like-click">
                            <span>${userReaction ? reactionIcons[userReaction.reaction_type] : "👍"}</span>
                            <span>${userReaction ? "Reagiu" : "Curtir"}</span>
                            <span>(${reactionCount})</span>
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

                    <button class="flex items-center justify-center gap-2 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition" data-action="toggle-comments">
                        <i data-lucide="message-circle" class="w-4 h-4"></i> Comentar
                    </button>

                    <button class="flex items-center justify-center gap-2 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition ${post.saved ? 'text-violet-600' : ''}" data-action="save-post">
                        <i data-lucide="bookmark" class="w-4 h-4"></i> ${post.saved ? "Salvo" : "Salvar"}
                    </button>
                </div>

                <div class="comments-area pt-3 border-t border-gray-100 mt-2" id="comments-${post.id}">
                    ${commentsHTML || `<p class="text-xs text-gray-400">Nenhum comentário ainda.</p>`}
                    <form class="flex gap-2 mt-3" data-post-id="${post.id}">
                        <input type="text" name="comment" placeholder="Escreva um comentário..." maxlength="2000" required class="flex-1 bg-gray-100 border border-transparent focus:border-cyan-600 rounded-full px-4 py-2 text-xs text-slate-900 focus:outline-none">
                        <button type="submit" class="bg-cyan-600 text-white rounded-full w-9 h-9 flex items-center justify-center hover:bg-cyan-700 transition shrink-0"><i data-lucide="send" class="w-4 h-4"></i></button>
                    </form>
                </div>
            </article>
        `;
    }));

    postsContainer.innerHTML = postHTMLs.join("");
    lucide.createIcons();
}


/* ==========================================================================
   10. MODAL DE MÍDIA, VÍDEOS E PLAYER PERSONALIZADO
   ========================================================================== */
window.openMediaModal = function(postId, mediaIndex = 0) {
    const post = globalPostsCache.find(p => p.id === postId);
    if (!post || !post.media || post.media.length === 0) return;

    activeModalPost = post;
    activeMediaIndex = mediaIndex;

    updateModalContent();
    mediaModal.classList.remove("hidden");
    mediaModal.classList.add("flex");
    document.body.style.overflow = "hidden";
}

async function updateModalContent() {
    if (!activeModalPost) return;
    const media = activeModalPost.media[activeMediaIndex];
    const author = activeModalPost.author || { full_name: "Usuário", username: "usuario" };

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

    const authorAvatarHTML = await renderAvatar(author, "w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 text-white font-black flex items-center justify-center shrink-0 overflow-hidden");
    modalAuthorHeader.innerHTML = `
        ${authorAvatarHTML}
        <div class="flex-1 min-w-0">
            <strong class="block text-sm font-bold text-slate-900">${escapeHTML(author.full_name || "Usuário")}</strong>
            <small class="text-xs text-gray-400">@${escapeHTML(author.username || "usuario")} · ${escapeHTML(formatDate(activeModalPost.created_at))}</small>
        </div>
    `;

    modalPostContent.innerHTML = activeModalPost.content ? `<p class="text-slate-800 leading-relaxed whitespace-pre-wrap">${formatRichText(activeModalPost.content)}</p>` : `<span class="text-gray-400 italic">Sem legenda.</span>`;
    await renderModalComments();
    lucide.createIcons();
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

async function renderModalComments() {
    if (!activeModalPost) return;
    const comments = activeModalPost.comments || [];
    if (comments.length === 0) {
        modalCommentsList.innerHTML = `<div class="p-6 text-center text-xs text-gray-400">Nenhum comentário ainda. Seja o primeiro a comentar!</div>`;
        return;
    }
    const commentsHTMLs = await Promise.all(comments.map(async c => {
        const commentAuthor = window.__faceCratoProfiles?.[c.user_id] || { full_name: "Usuário", username: "usuario" };
        const commentAvatarHTML = await renderAvatar(commentAuthor, "w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 text-white text-xs");
        return `
            <div class="flex gap-3 py-2">
                ${commentAvatarHTML}
                <div class="flex-1 bg-gray-50 border border-gray-100 p-3 rounded-2xl text-xs">
                    <strong class="block text-cyan-700 font-bold mb-1">${escapeHTML(commentAuthor.full_name || "Usuário")}</strong>
                    <p class="text-slate-800 leading-relaxed">${formatRichText(c.content)}</p>
                </div>
            </div>
        `;
    }));
    modalCommentsList.innerHTML = commentsHTMLs.join("");
}

prevMediaBtn.addEventListener("click", () => { if (activeMediaIndex > 0) { activeMediaIndex--; updateModalContent(); } });
nextMediaBtn.addEventListener("click", () => { if (activeModalPost && activeMediaIndex < activeModalPost.media.length - 1) { activeMediaIndex++; updateModalContent(); } });

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
    const { data, error } = await supabase.from("comments").insert({ post_id: activeModalPost.id, user_id: currentUser.id, content }).select("id, post_id, user_id, content, created_at").single();
    if (!error && data) {
        activeModalPost.comments.push(data);
        modalCommentInput.value = "";
        await renderModalComments();
        await loadFeed();
    }
});


/* ==========================================================================
   11. CRIAÇÃO E PUBLICAÇÃO DE NOVOS POSTS
   ========================================================================== */
mediaInput.addEventListener("change", () => {
    const file = mediaInput.files[0];
    if (!file) { filePreview.classList.add("hidden"); return; }
    filePreview.classList.remove("hidden");
    filePreview.textContent = `Arquivo: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
});

publishButton.addEventListener("click", async () => {
    const content = postContent.value.trim();
    const file = mediaInput.files[0];
    if (!content && !file) { showError("Escreva alguma coisa ou escolha um arquivo."); return; }

    publishButton.disabled = true;
    publishButton.textContent = "Publicando...";

    try {
        const postType = file ? (file.type.startsWith("video/") ? "video" : "photo") : "text";
        const { data: post, error: postErr } = await supabase.from("posts").insert({ user_id: currentUser.id, content, post_type: postType, visibility: visibility.value, comments_permission: "everyone" }).select("id").single();
        if (postErr) throw postErr;

        if (file) {
            const ext = file.name.split(".").pop();
            const filePath = `${currentUser.id}/${post.id}/${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabase.storage.from("post-media").upload(filePath, file, { contentType: file.type });
            if (upErr) throw upErr;
            await supabase.from("post_media").insert({ post_id: post.id, media_url: filePath, media_type: file.type.startsWith("video/") ? "video" : "image", position: 0 });
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
   12. EVENT LISTENERS DO FEED (Curtidas, Comentários Inline, Exclusão)
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

    if (action === "toggle-comments") { 
        document.getElementById(`comments-${postId}`)?.classList.toggle("open"); 
    }

    if (action === "save-post") {
        soundFx.playPop();
        const { data: existing } = await supabase.from("saved_posts").select("post_id").eq("post_id", postId).eq("user_id", currentUser.id).maybeSingle();
        if (existing) { await supabase.from("saved_posts").delete().eq("post_id", postId).eq("user_id", currentUser.id); }
        else { await supabase.from("saved_posts").insert({ post_id: postId, user_id: currentUser.id }); }
        await loadFeed();
    }

    if (action === "delete-post") {
        const confirm = await Swal.fire({ title:"Excluir?", icon:"warning", showCancelButton:true, confirmButtonColor:"#dc2626" });
        if (!confirm.isConfirmed) return;
        await supabase.from("posts").delete().eq("id", postId).eq("user_id", currentUser.id);
        showSuccess("Excluído com sucesso.");
        await loadFeed();
    }
});

async function applyReaction(postId, reactionType) {
    document.querySelectorAll(".reaction-popup").forEach(p => p.classList.remove("show"));
    soundFx.playPop();
    const { data: existing } = await supabase.from("reactions").select("id,reaction_type").eq("post_id", postId).eq("user_id", currentUser.id).maybeSingle();

    if (existing) {
        if (existing.reaction_type === reactionType) await supabase.from("reactions").delete().eq("post_id", postId).eq("user_id", currentUser.id);
        else await supabase.from("reactions").update({ reaction_type: reactionType }).eq("post_id", postId).eq("user_id", currentUser.id);
    } else {
        await supabase.from("reactions").insert({ post_id: postId, user_id: currentUser.id, reaction_type: reactionType });
    }
    await loadFeed();
}

postsContainer.addEventListener("submit", async event => {
    const form = event.target.closest("form");
    if (!form || !form.dataset.postId) return;
    event.preventDefault();

    const postId = form.dataset.postId;
    const input = form.querySelector("input[name='comment']");
    const content = input.value.trim();
    if (!content) return;

    soundFx.playPop();
    await supabase.from("comments").insert({ post_id: postId, user_id: currentUser.id, content });
    await loadFeed();
    document.getElementById(`comments-${postId}`)?.classList.add("open");
});


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
