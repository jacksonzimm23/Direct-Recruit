$file = "c:\Users\jacks\OneDrive - Colorado School of Mines\Desktop\direct-recruit\frontend\shared\feed.js"
$content = Get-Content $file -Raw

# ========================================================================
# 1. Create post avatar in loadCurrentUser (line ~63-65)
# Add border line after the innerHTML assignment inside the if(avatar) block
# ========================================================================
$old1 = @'
                const avatar = document.querySelector('.create-post-box .post-avatar-circle');
                if (avatar) {
                    avatar.innerHTML = `<img src="${response.profile.profile_image_url}" alt="Your avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                }
            }
        } catch (error) {
            console.error('Error loading user:', error);
'@

$new1 = @'
                const avatar = document.querySelector('.create-post-box .post-avatar-circle');
                if (avatar) {
                    avatar.innerHTML = `<img src="${response.profile.profile_image_url}" alt="Your avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    avatar.style.border = `2px solid ${getRoleBorderColor(response.user.role, response.user.is_transfer_player, response.profile.college_division)}`;
                }
            }
        } catch (error) {
            console.error('Error loading user:', error);
'@

$content = $content.Replace($old1, $new1)

# ========================================================================
# 2. Create post avatar in updateCreatePostAvatar (line ~79-81)
# ========================================================================
$old2 = @'
                const avatar = document.querySelector('.create-post-box .post-avatar-circle');
                if (avatar) {
                    avatar.innerHTML = `<img src="${response.profile.profile_image_url}" alt="Your avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                }
            }
        } catch (error) {
            console.error('Error updating avatar:', error);
'@

$new2 = @'
                const avatar = document.querySelector('.create-post-box .post-avatar-circle');
                if (avatar) {
                    avatar.innerHTML = `<img src="${response.profile.profile_image_url}" alt="Your avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    avatar.style.border = `2px solid ${getRoleBorderColor(response.user.role, response.user.is_transfer_player, response.profile.college_division)}`;
                }
            }
        } catch (error) {
            console.error('Error updating avatar:', error);
'@

$content = $content.Replace($old2, $new2)

# ========================================================================
# 3 & 4. Regular post avatars and reposted post avatars (lines ~773, ~908)
# These use post.author_role, post.author_transfer, post.author_division
# Pattern: <div class="post-avatar-circle"> immediately after the post-avatar-link with author data
# ========================================================================

# For regular posts and repost-with-original posts, the pattern is:
# <div class="post-avatar-circle">
# We need to add style with the border color based on author data

# Location 3 (line 773) - regular post
$old3 = 'onclick="feedManager.goToProfile(''${post.author_username || post.user_id}'', ''${post.author_role}'', ''${post.author_division || ''''}'', ''${post.user_id}'', ${post.author_transfer === ''y''}); return false;">
                    <div class="post-avatar-circle">
                        ${post.author_image ?
                            `<img src="${post.author_image}" alt="${authorName}">` :
                            `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                </a>
                <div class="post-user-info">
                    <div class="post-user-name-row">
                        <a href="#" class="post-user-name" onclick="feedManager.goToProfile(''${post.author_username || post.user_id}'', ''${post.author_role}'', ''${post.author_division || ''''}'', ''${post.user_id}'', ${post.author_transfer === ''y''}); return false;">'

$new3 = 'onclick="feedManager.goToProfile(''${post.author_username || post.user_id}'', ''${post.author_role}'', ''${post.author_division || ''''}'', ''${post.user_id}'', ${post.author_transfer === ''y''}); return false;">
                    <div class="post-avatar-circle" style="border: 2px solid ${getRoleBorderColor(post.author_role, post.author_transfer === ''y'', post.author_division)}">
                        ${post.author_image ?
                            `<img src="${post.author_image}" alt="${authorName}">` :
                            `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                </a>
                <div class="post-user-info">
                    <div class="post-user-name-row">
                        <a href="#" class="post-user-name" onclick="feedManager.goToProfile(''${post.author_username || post.user_id}'', ''${post.author_role}'', ''${post.author_division || ''''}'', ''${post.user_id}'', ${post.author_transfer === ''y''}); return false;">'

$content = $content.Replace($old3, $new3)

Write-Output "Replacements 1-3 done (or attempted)"

$content | Set-Content $file -NoNewline -Encoding UTF8
Write-Output "File saved after batch 1"
