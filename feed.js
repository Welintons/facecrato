/* ==========================================================================
   FEED.JS - FACE CRATO (Integrado com Alpine.js & Supabase)
   ========================================================================== */
import { supabase } from "./supabase.js";

const reactionIcons = { like: "👍", love: "❤️", haha: "😂", wow: "😮", sad: "😢", angry: "😡" };

/* ==========================================================================
   SISTEMA DE EFEITOS SONOROS (Web Audio API)
   ========================================================================== */
const soundFx = {
    ctx: null,
    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    playTone(freqStart, freqEnd, type, duration, volume = 0.1) {
        try {
            this.init();
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freqStart, now);
            if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
            gain.gain.setValueAtTime(volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + duration);
        } catch(e) {}
    },
    playPop() { this.playTone(400, 800, 'sine', 0.08, 0.12); },
    playSuccess() { this.playTone(523.25, null, 'triangle', 0.3, 0.1); },
    playNotification() { this.playTone(880, 1318.51, 'sine', 0.35, 0.1); }
};

/* ==========================================================================
   FUNÇÕES UTILITÁRIAS
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

const urlCache = new Map();
async function getStorageUrl(bucket, path) {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const cacheKey = `${bucket}:${path}`;
    if (urlCache.has(cacheKey)) return urlCache.get(cacheKey);

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return null;
    urlCache.set(cacheKey, data.signedUrl);
    return data.signedUrl;
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
   COMPONENTE PRINCIPAL ALPINE.JS
   ========================================================================== */
document.addEventListener('alpine:init', () => {
    Alpine.data('feedApp', () => ({
        currentUser: null,
        currentProfile: null,
        posts: [],
        loading: false,
        postContent: '',
        visibility: 'public',
        selectedFile: null,
        filePreviewName: '',
        postLimit: 10,
        notificationsChannel: null,

        async init() {
            const { data, error } = await supabase.auth.getSession();
            if (error || !data.session) {
                window.location.replace("./login.html");
                return;
            }
            this.currentUser = data.session.user;

            const { data: profile } = await supabase
                .from("profiles")
                .select("id, username, full_name, avatar_url")
                .eq("id", this.currentUser.id)
                .maybeSingle();

            this.currentProfile = profile || { 
                id: this.currentUser.id, 
                username: this.currentUser.email?.split("@")[0] || "usuario", 
                full_name: "Usuário" 
            };

            // Renderiza avatares fixos da interface
            document.getElementById("sideAvatar").innerHTML = await renderAvatar(this.currentProfile, "w-full h-full rounded-full");
            document.getElementById("composerAvatar").innerHTML = await renderAvatar(this.currentProfile, "w-full h-full rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 text-white");
            document.getElementById("mobileMenuAvatar").innerHTML = await renderAvatar(this.currentProfile, "w-full h-full rounded-full");

            await this.loadFeed();
            this.setupUIEventListeners();
        },

        async loadFeed() {
            if (this.loading) return;
            this.loading = true;

            try {
                const { data: posts, error } = await supabase
                    .from("posts")
                    .select(`id, user_id, content, post_type, visibility, comments_permission, created_at`)
                    .order("created_at", { ascending: false })
                    .limit(this.postLimit);

                if (error) throw error;
                if (!posts || posts.length === 0) {
                    this.posts = [];
                    this.loading = false;
                    return;
                }

                const postIds = posts.map(p => p.id);
                const userIds = [...new Set(posts.map(p => p.user_id))];

                const [profilesRes, mediaRes, reactionsRes, commentsRes, savedRes] = await Promise.all([
                    supabase.from("profiles").select("id,username,full_name,avatar_url").in("id", userIds),
                    supabase.from("post_media").select("id,post_id,media_url,media_type,position").in("post_id", postIds).order("position"),
                    supabase.from("reactions").select("post_id,user_id,reaction_type").in("post_id", postIds),
                    supabase.from("comments").select("id,post_id,user_id,content,created_at").in("post_id", postIds).order("created_at", { ascending: true }),
                    supabase.from("saved_posts").select("post_id").eq("user_id", this.currentUser.id).in("post_id", postIds)
                ]);

                const profileMap = Object.fromEntries((profilesRes.data || []).map(p => [p.id, p]));
                window.__faceCratoProfiles = profileMap;

                const mediaMap = {}; (mediaRes.data || []).forEach(m => { if (!mediaMap[m.post_id]) mediaMap[m.post_id] = []; mediaMap[m.post_id].push(m); });
                const commentsMap = {}; (commentsRes.data || []).forEach(c => { if (!commentsMap[c.post_id]) commentsMap[c.post_id] = []; commentsMap[c.post_id].push(c); });
                const reactionMap = {}; (reactionsRes.data || []).forEach(r => { if (!reactionMap[r.post_id]) reactionMap[r.post_id] = []; reactionMap[r.post_id].push(r); });
                const saved = new Set((savedRes.data || []).map(s => s.post_id));

                this.posts = await Promise.all(posts.map(async post => {
                    const postMedia = mediaMap[post.id] || [];
                    const signedMedia = await Promise.all(postMedia.map(async item => {
                        const signedUrl = await getStorageUrl("post-media", item.media_url);
                        return {...item, signedUrl};
                    }));

                    const author = profileMap[post.user_id] || { full_name: "Usuário", username: "usuario" };
                    const authorAvatar = await renderAvatar(author, "w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 text-white font-black flex items-center justify-center shrink-0 overflow-hidden");

                    return {
                        ...post,
                        author,
                        authorAvatar,
                        media: signedMedia,
                        reactions: reactionMap[post.id] || [],
                        comments: commentsMap[post.id] || [],
                        saved: saved.has(post.id)
                    };
                }));

                window.globalPostsCache = this.posts;
                setTimeout(() => lucide.createIcons(), 50);

            } catch (err) {
                console.error("Erro ao carregar feed:", err);
            } finally {
                this.loading = false;
            }
        },

        async createPost() {
            if (!this.postContent.trim() && !this.selectedFile) {
                showError("Escreva alguma coisa ou escolha um arquivo.");
                return;
            }

            try {
                const postType = this.selectedFile ? (this.selectedFile.type.startsWith("video/") ? "video" : "photo") : "text";
                const { data: post, error: postErr } = await supabase.from("posts").insert({
                    user_id: this.currentUser.id,
                    content: this.postContent,
                    post_type: postType,
                    visibility: this.visibility
                }).select("id").single();

                if (postErr) throw postErr;

                if (this.selectedFile) {
                    const file = this.selectedFile;
                    const ext = file.name.split(".").pop();
                    const filePath = `${this.currentUser.id}/${post.id}/${crypto.randomUUID()}.${ext}`;
                    await supabase.storage.from("post-media").upload(filePath, file, { contentType: file.type });
                    await supabase.from("post_media").insert({ 
                        post_id: post.id, 
                        media_url: filePath, 
                        media_type: file.type.startsWith("video/") ? "video" : "image", 
                        position: 0 
                    });
                }

                this.postContent = '';
                this.selectedFile = null;
                this.filePreviewName = '';
                document.getElementById("mediaInput").value = "";

                soundFx.playSuccess();
                showSuccess("Publicado com sucesso!");
                await this.loadFeed();
            } catch (err) {
                showError(err.message || "Erro ao publicar.");
            }
        },

        handleFileSelect(event) {
            const file = event.target.files[0];
            if (file) {
                this.selectedFile = file;
                this.filePreviewName = `Arquivo: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
            }
        },

        setupUIEventListeners() {
            // Mobile Menu
            const menuToggleBtn = document.getElementById("menuToggleBtn");
            const menuCloseBtn = document.getElementById("menuCloseBtn");
            const mobileMenuDrawer = document.getElementById("mobileMenuDrawer");
            const mobileMenuOverlay = document.getElementById("mobileMenuOverlay");

            const toggleDrawer = (open) => {
                if (open) {
                    mobileMenuOverlay?.classList.remove("hidden");
                    setTimeout(() => mobileMenuDrawer?.classList.remove("translate-x-full"), 10);
                } else {
                    mobileMenuDrawer?.classList.add("translate-x-full");
                    setTimeout(() => mobileMenuOverlay?.classList.add("hidden"), 300);
                }
            };

            menuToggleBtn?.addEventListener("click", () => toggleDrawer(true));
            menuCloseBtn?.addEventListener("click", () => toggleDrawer(false));
            mobileMenuOverlay?.addEventListener("click", () => toggleDrawer(false));

            // Perfil & Logout
            document.getElementById("profileButton")?.addEventListener("click", () => window.location.href = "./perfil.html");
            document.getElementById("logoutButtonMobile")?.addEventListener("click", async () => {
                const confirm = await Swal.fire({ title: "Sair da conta?", icon: "question", showCancelButton: true, confirmButtonColor: "#0891b2" });
                if (confirm.isConfirmed) {
                    await supabase.auth.signOut();
                    window.location.replace("./login.html");
                }
            });
        }
    }));
});
