# 服务器部署说明

服务器通过本机别名连接：

```powershell
ssh sub2api
```

部署前必须先完成：

1. 腾讯云控制台创建服务器快照。
2. Cloudflare 新增 `kb.zero007.chat` A 记录，指向服务器公网 IP。
3. 确认安全组开放 `80`、`443`。

服务器目录初始化：

```bash
sudo bash /opt/fastgpt/bootstrap.sh
```

Nginx 策略：

- `api.zero007.chat` 保持现有 sub2api 配置。
- `kb.zero007.chat` 新增 server block，反代 FastGPT Web 端口。
- `/storage` 不配置静态裸露访问。

HTTPS：

```bash
sudo certbot --nginx -d kb.zero007.chat
```

