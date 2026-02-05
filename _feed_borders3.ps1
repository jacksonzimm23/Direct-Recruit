$file = "c:\Users\jacks\OneDrive - Colorado School of Mines\Desktop\direct-recruit\frontend\shared\feed.js"
$content = Get-Content $file -Raw

# ========================================================================
# 7. Quoted post avatar (line ~1074) - inside quote embed, post.author_*
# This one has NO <a> wrapper, just <div class="quoted-post-header"> then <div class="quoted-post-avatar">
# ========================================================================
$old = @"
                <div class="quoted-post-header">
                    <div class="quoted-post-avatar">
                        `${post.author_image ?
                            ``<img src="`${post.author_image}" alt="`${originalAuthorName}">`` :
"@
$new = @"
                <div class="quoted-post-header">
                    <div class="quoted-post-avatar" style="border: 2px solid `${getRoleBorderColor(post.author_role, post.author_transfer === 'y', post.author_division)}">
                        `${post.author_image ?
                            ``<img src="`${post.author_image}" alt="`${originalAuthorName}">`` :
"@
$content = $content.Replace($old, $new)

# ========================================================================
# 8. Quoted post avatar in share (line ~1211) - share.author_*
# Has <a> wrapper before the div
# ========================================================================
$old = @"
                    <a href="#" onclick="feedManager.goToProfile('`${share.author_username || share.author_user_id}', '`${share.author_role}', '`${share.author_division || ''}', '`${share.author_user_id}', `${share.author_transfer === 'y'}); event.stopPropagation(); return false;">
                        <div class="quoted-post-avatar">
"@
$new = @"
                    <a href="#" onclick="feedManager.goToProfile('`${share.author_username || share.author_user_id}', '`${share.author_role}', '`${share.author_division || ''}', '`${share.author_user_id}', `${share.author_transfer === 'y'}); event.stopPropagation(); return false;">
                        <div class="quoted-post-avatar" style="border: 2px solid `${getRoleBorderColor(share.author_role, share.author_transfer === 'y', share.author_division)}">
"@
$content = $content.Replace($old, $new)

# ========================================================================
# 9. Quoted post avatar in post-view (line ~1689) - post.author_* with || 'player'
# Has <a> wrapper
# ========================================================================
$old = @"
                    <a href="#" onclick="feedManager.goToProfile('`${post.author_username || post.author_user_id}', '`${post.author_role || 'player'}', '`${post.author_division || ''}', '`${post.author_user_id}', `${post.author_transfer === 'y'}); event.stopPropagation(); return false;">
                        <div class="quoted-post-avatar">
"@
$new = @"
                    <a href="#" onclick="feedManager.goToProfile('`${post.author_username || post.author_user_id}', '`${post.author_role || 'player'}', '`${post.author_division || ''}', '`${post.author_user_id}', `${post.author_transfer === 'y'}); event.stopPropagation(); return false;">
                        <div class="quoted-post-avatar" style="border: 2px solid `${getRoleBorderColor(post.author_role || 'player', post.author_transfer === 'y', post.author_division)}">
"@
$content = $content.Replace($old, $new)

Write-Output "Replacements 7-9 done"
$content | Set-Content $file -NoNewline -Encoding UTF8
Write-Output "File saved"
