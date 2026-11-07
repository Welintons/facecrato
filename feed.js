import { supabase } from "./supabase.js";

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
        
        // Inicialização da Aplicação
        async init() {
            const { data, error } = await supabase.auth.getSession();
            if (error || !data.session) {
                window.location.replace("./login.html");
                return;
            }
            this.currentUser = data.session.user;

            // Busca perfil do usuário
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

            await this.loadPosts();
        },

        // Carregar Posts
        async loadPosts() {
            if (this.loading) return;
            this.loading = true;

            try {
                const { data, error } = await supabase
                    .from("posts")
                    .select(`id, user_id, content, post_type, visibility, created_at`)
                    .order("created_at", { ascending: false })
                    .limit(15);

                if (error) throw error;

                // Mapeia perfis e mídias
                this.posts = data || [];
            } catch (err) {
                console.error("Erro ao carregar feed:", err);
            } finally {
                this.loading = false;
            }
        },

        // Criar Publicação
        async createPost() {
            if (!this.postContent.trim() && !this.selectedFile) {
                Swal.fire("Ops!", "Escreva alguma coisa ou selecione uma mídia.", "warning");
                return;
            }

            try {
                const { data, error } = await supabase.from("posts").insert({
                    user_id: this.currentUser.id,
                    content: this.postContent,
                    visibility: this.visibility,
                    post_type: this.selectedFile ? 'photo' : 'text'
                }).select("id").single();

                if (error) throw error;

                this.postContent = '';
                this.selectedFile = null;
                this.filePreviewName = '';
                
                Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Publicado com sucesso!', timer: 2000, showConfirmButton: false });
                await this.loadPosts();
            } catch (err) {
                Swal.fire("Erro", err.message, "error");
            }
        },

        handleFileSelect(event) {
            const file = event.target.files[0];
            if (file) {
                this.selectedFile = file;
                this.filePreviewName = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
            }
        }
    }));
});
