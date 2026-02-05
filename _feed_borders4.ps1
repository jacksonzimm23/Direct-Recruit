$file = "c:\Users\jacks\OneDrive - Colorado School of Mines\Desktop\direct-recruit\frontend\shared\feed.js"
$content = Get-Content $file -Raw

# ========================================================================
# 10. Comment avatar (line ~2418) - comment.author_*
# ========================================================================
$old = '<div class="comment-avatar clickable-profile" onclick="feedManager.goToProfile(''${comment.author_username || comment.user_id}'', ''${comment.author_role || ''player''}'', ''${comment.author_division || ''''}'', ''${comment.user_id}'', ${comment.author_transfer === ''y''})">
                            ${comment.author_image ?'
$new = '<div class="comment-avatar clickable-profile" onclick="feedManager.goToProfile(''${comment.author_username || comment.user_id}'', ''${comment.author_role || ''player''}'', ''${comment.author_division || ''''}'', ''${comment.user_id}'', ${comment.author_transfer === ''y''})" style="border: 2px solid ${getRoleBorderColor(comment.author_role || ''player'', comment.author_transfer === ''y'', comment.author_division)}">
                            ${comment.author_image ?'
$content = $content.Replace($old, $new)

# ========================================================================
# 11. Share comment avatar (line ~2635) - comment.role, comment.transfer, comment.division
# ========================================================================
$old = '<div class="comment-avatar clickable-profile" onclick="feedManager.goToProfile(''${comment.username || comment.user_id}'', ''${comment.role || ''player''}'', ''${comment.division || ''''}'', ''${comment.user_id}'', ${comment.transfer === ''y''})">
                            ${comment.profile_image ?'
$new = '<div class="comment-avatar clickable-profile" onclick="feedManager.goToProfile(''${comment.username || comment.user_id}'', ''${comment.role || ''player''}'', ''${comment.division || ''''}'', ''${comment.user_id}'', ${comment.transfer === ''y''})" style="border: 2px solid ${getRoleBorderColor(comment.role || ''player'', comment.transfer === ''y'', comment.division)}">
                            ${comment.profile_image ?'
$content = $content.Replace($old, $new)

# ========================================================================
# 12. Quote-post-preview avatar (line ~2920) - DOM extraction, no role data available
# We'll grab the border from the source post's avatar
# ========================================================================
$old = '                    <div class="quote-post-preview-avatar">'
$new = '                    <div class="quote-post-preview-avatar" style="border: 2px solid ${postCard.querySelector(''.post-avatar-circle'')?.style.borderColor || ''#1282a2''}">'
$content = $content.Replace($old, $new)

# ========================================================================
# 13. Share-item avatar in shares list (line ~3919) - share.role, share.transfer, share.college_division
# ========================================================================
$old = @"
            <div class="share-item" onclick="feedManager.goToProfile('`${share.username || share.user_id}', '`${share.role}', '`${share.college_division || ''}', '`${share.user_id}', `${share.transfer === 'y'}); feedManager.closeModal('shares-modal');">
                <div class="share-item-avatar">
                    `${share.profile_image_url ?
"@
$new = @"
            <div class="share-item" onclick="feedManager.goToProfile('`${share.username || share.user_id}', '`${share.role}', '`${share.college_division || ''}', '`${share.user_id}', `${share.transfer === 'y'}); feedManager.closeModal('shares-modal');">
                <div class="share-item-avatar" style="border: 2px solid `${getRoleBorderColor(share.role, share.transfer === 'y', share.college_division)}">
                    `${share.profile_image_url ?
"@
$content = $content.Replace($old, $new)

# ========================================================================
# 14. Share-item avatar in likes list (line ~3996) - like.role, like.transfer, like.college_division
# ========================================================================
$old = @"
                        <div class="share-item" onclick="feedManager.goToProfile('`${like.username || like.id}', '`${like.role}', '`${like.college_division || ''}', '`${like.id}', `${like.transfer === 'y'}); feedManager.closeModal('likes-modal');">
                            <div class="share-item-avatar">
                                `${like.profile_image_url ?
"@
$new = @"
                        <div class="share-item" onclick="feedManager.goToProfile('`${like.username || like.id}', '`${like.role}', '`${like.college_division || ''}', '`${like.id}', `${like.transfer === 'y'}); feedManager.closeModal('likes-modal');">
                            <div class="share-item-avatar" style="border: 2px solid `${getRoleBorderColor(like.role, like.transfer === 'y', like.college_division)}">
                                `${like.profile_image_url ?
"@
$content = $content.Replace($old, $new)

Write-Output "Replacements 10-14 done"
$content | Set-Content $file -NoNewline -Encoding UTF8
Write-Output "File saved"
