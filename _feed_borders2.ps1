$file = "c:\Users\jacks\OneDrive - Colorado School of Mines\Desktop\direct-recruit\frontend\shared\feed.js"
$content = Get-Content $file -Raw

# ========================================================================
# 4. Reposter avatar (line ~1032) - post.reposter_*
# ========================================================================
$old = "feedManager.goToProfile('`${post.reposter_username || post.reposter_user_id}', '`${post.reposter_role}', '`${post.reposter_division || ''}', '`${post.reposter_user_id}', `${post.reposter_transfer === 'y'}); return false;"">
                    <div class=""post-avatar-circle"">
                        `${post.reposter_image ?"
$new = "feedManager.goToProfile('`${post.reposter_username || post.reposter_user_id}', '`${post.reposter_role}', '`${post.reposter_division || ''}', '`${post.reposter_user_id}', `${post.reposter_transfer === 'y'}); return false;"">
                    <div class=""post-avatar-circle"" style=""border: 2px solid `${getRoleBorderColor(post.reposter_role, post.reposter_transfer === 'y', post.reposter_division)}"">
                        `${post.reposter_image ?"
$content = $content.Replace($old, $new)

# ========================================================================
# 5. Share quoter avatar (line ~1173) - share.quoter_*
# ========================================================================
$old = "feedManager.goToProfile('`${share.quoter_username || share.quoter_user_id}', '`${share.quoter_role}', '`${share.quoter_division || ''}', '`${share.quoter_user_id}', `${share.quoter_transfer === 'y'}); return false;"">
                    <div class=""post-avatar-circle"">
                        `${share.quoter_image ?"
$new = "feedManager.goToProfile('`${share.quoter_username || share.quoter_user_id}', '`${share.quoter_role}', '`${share.quoter_division || ''}', '`${share.quoter_user_id}', `${share.quoter_transfer === 'y'}); return false;"">
                    <div class=""post-avatar-circle"" style=""border: 2px solid `${getRoleBorderColor(share.quoter_role, share.quoter_transfer === 'y', share.quoter_division)}"">
                        `${share.quoter_image ?"
$content = $content.Replace($old, $new)

# ========================================================================
# 6. Post-view quoter avatar (line ~1648) - post.quoter_* with event.stopPropagation
# ========================================================================
$old = "feedManager.goToProfile('`${post.quoter_username || post.quoter_user_id}', '`${post.quoter_role || 'player'}', '`${post.quoter_division || ''}', '`${post.quoter_user_id}', `${post.quoter_transfer === 'y'}); return false;"">
                    <div class=""post-avatar-circle"">
                        `${post.quoter_image ?"
$new = "feedManager.goToProfile('`${post.quoter_username || post.quoter_user_id}', '`${post.quoter_role || 'player'}', '`${post.quoter_division || ''}', '`${post.quoter_user_id}', `${post.quoter_transfer === 'y'}); return false;"">
                    <div class=""post-avatar-circle"" style=""border: 2px solid `${getRoleBorderColor(post.quoter_role || 'player', post.quoter_transfer === 'y', post.quoter_division)}"">
                        `${post.quoter_image ?"
$content = $content.Replace($old, $new)

Write-Output "Replacements 4-6 done"
$content | Set-Content $file -NoNewline -Encoding UTF8
Write-Output "File saved"
