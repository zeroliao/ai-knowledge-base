# 服务器部署说明

服务器通过本机别名连接：

```powershell
ssh kb-server
```

部署前必须先完成：

1. 腾讯云控制台创建服务器快照。
2. Cloudflare 新增 `kb.zero007.chat` A 记录，指向服务器公网 IP。
3. 确认安全组开放 `80`、`443`。

生产部署规范见 `docs/deployment-standard.md`。每次部署都必须记录版本、镜像 tag、回滚目标、访问验证和日志检查结果。

服务器目录初始化：

```bash
sudo bash /opt/fastgpt/bootstrap.sh
```

Caddy 策略：

- `kb.zero007.chat` 新增独立站点块，反代 FastGPT Web 端口。
- `/storage` 不配置静态裸露访问。

Caddy 配置和 HTTPS：

```bash
sudo nano /etc/caddy/Caddyfile
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy 会自动申请和续期 HTTPS 证书。
