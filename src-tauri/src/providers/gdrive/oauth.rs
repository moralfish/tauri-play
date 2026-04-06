use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenData {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
}

pub struct OAuthManager {
    client_id: String,
    client_secret: String,
    token_path: PathBuf,
    token: Mutex<Option<TokenData>>,
}

impl OAuthManager {
    pub fn new(client_id: String, client_secret: String, data_dir: PathBuf) -> Self {
        let token_path = data_dir.join("gdrive_token.json");
        let token = Self::load_token(&token_path);
        Self {
            client_id,
            client_secret,
            token_path,
            token: Mutex::new(token),
        }
    }

    fn load_token(path: &PathBuf) -> Option<TokenData> {
        let data = std::fs::read_to_string(path).ok()?;
        serde_json::from_str(&data).ok()
    }

    fn save_token(&self, token: &TokenData) -> Result<()> {
        let data = serde_json::to_string_pretty(token)?;
        std::fs::write(&self.token_path, data)?;
        Ok(())
    }

    pub async fn get_access_token(&self) -> Result<String> {
        let mut guard = self.token.lock().await;
        if let Some(ref token) = *guard {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .as_secs();
            if now < token.expires_at - 60 {
                return Ok(token.access_token.clone());
            }
            // Token expired, refresh it
            let refreshed = self.refresh_token(&token.refresh_token).await?;
            self.save_token(&refreshed)?;
            let access = refreshed.access_token.clone();
            *guard = Some(refreshed);
            return Ok(access);
        }
        anyhow::bail!("No Google Drive token available. Please connect your account first.")
    }

    async fn refresh_token(&self, refresh_token: &str) -> Result<TokenData> {
        let client = reqwest::Client::new();
        let resp = client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("refresh_token", refresh_token),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await?;

        let body: serde_json::Value = resp.json().await?;
        let access_token = body["access_token"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing access_token in refresh response"))?
            .to_string();
        let expires_in = body["expires_in"].as_u64().unwrap_or(3600);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs();

        Ok(TokenData {
            access_token,
            refresh_token: refresh_token.to_string(),
            expires_at: now + expires_in,
        })
    }

    pub async fn exchange_code(&self, code: &str, redirect_uri: &str) -> Result<TokenData> {
        let client = reqwest::Client::new();
        let resp = client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("code", code),
                ("redirect_uri", redirect_uri),
                ("grant_type", "authorization_code"),
            ])
            .send()
            .await?;

        let body: serde_json::Value = resp.json().await?;
        let access_token = body["access_token"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing access_token"))?
            .to_string();
        let refresh_token = body["refresh_token"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing refresh_token"))?
            .to_string();
        let expires_in = body["expires_in"].as_u64().unwrap_or(3600);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs();

        let token = TokenData {
            access_token,
            refresh_token,
            expires_at: now + expires_in,
        };
        self.save_token(&token)?;
        let mut guard = self.token.lock().await;
        *guard = Some(token.clone());
        Ok(token)
    }

    pub fn auth_url(&self) -> String {
        format!(
            "https://accounts.google.com/o/oauth2/v2/auth?\
            client_id={}&\
            redirect_uri=http://127.0.0.1:1421&\
            response_type=code&\
            scope=https://www.googleapis.com/auth/drive.readonly&\
            access_type=offline&\
            prompt=consent",
            self.client_id
        )
    }

    pub fn has_token(&self) -> bool {
        self.token_path.exists()
    }

    pub fn disconnect(&self) -> Result<()> {
        if self.token_path.exists() {
            std::fs::remove_file(&self.token_path)?;
        }
        Ok(())
    }
}
