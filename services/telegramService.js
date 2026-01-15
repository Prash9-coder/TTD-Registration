const TelegramBot = require('node-telegram-bot-api');

// Initialize bot (polling disabled for webhook compatibility)
let bot = null;

if (process.env.TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
        polling: false
    });
    console.log('✅ Telegram Bot initialized');
} else {
    console.log('⚠️ Telegram Bot token not found');
}

/**
 * Send notification to admin about new team registration
 */
async function sendNewTeamNotification(team) {
    if (!bot || !process.env.TELEGRAM_ADMIN_CHAT_ID) {
        console.log('⚠️ Telegram not configured, skipping notification');
        return { success: false, message: 'Telegram not configured' };
    }

    try {
        const teamLeader = team.members[0];

        const message = `
🔔 *NEW TEAM REGISTRATION*

*Team Name:* ${team.team_name}
*Total Members:* ${team.members_count}

👤 *Team Leader:*
━━━━━━━━━━━━━━━━
• Name: ${teamLeader.name}
• Age: ${teamLeader.age}
• Gender: ${teamLeader.gender}
• Mobile: ${teamLeader.mobile_full || teamLeader.mobile_masked}
• Email: ${teamLeader.email}
• Location: ${teamLeader.city}, ${teamLeader.state}

📅 *Registered:* ${new Date(team.created_at).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
        })}

⏳ *Status:* Pending Verification

🔗 [Open Admin Panel](${process.env.ADMIN_DASHBOARD_URL})
        `;

        await bot.sendMessage(
            process.env.TELEGRAM_ADMIN_CHAT_ID,
            message,
            {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            }
        );

        console.log('✅ Telegram notification sent to admin');
        return { success: true };

    } catch (error) {
        console.error('❌ Telegram notification error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send verification confirmation to admin
 */
async function sendTeamVerifiedNotification(team) {
    if (!bot || !process.env.TELEGRAM_ADMIN_CHAT_ID) {
        return { success: false };
    }

    try {
        const message = `
✅ *TEAM VERIFIED*

*Team:* ${team.team_name}
*Members:* ${team.members_count}
*Status:* ✓ Verified

📧 Verification emails sent to all team members.

🔗 [View in Admin Panel](${process.env.ADMIN_DASHBOARD_URL})
        `;

        await bot.sendMessage(
            process.env.TELEGRAM_ADMIN_CHAT_ID,
            message,
            { parse_mode: 'Markdown' }
        );

        console.log('✅ Verification notification sent via Telegram');
        return { success: true };

    } catch (error) {
        console.error('❌ Telegram verification notification error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send team deletion notification
 */
async function sendTeamDeletedNotification(teamName, teamId) {
    if (!bot || !process.env.TELEGRAM_ADMIN_CHAT_ID) {
        return { success: false };
    }

    try {
        const message = `
🗑️ *TEAM DELETED*

*Team Name:* ${teamName}
*Team ID:* ${teamId}
*Time:* ${new Date().toLocaleString('en-IN')}

Team has been permanently removed from the database.
        `;

        await bot.sendMessage(
            process.env.TELEGRAM_ADMIN_CHAT_ID,
            message,
            { parse_mode: 'Markdown' }
        );

        return { success: true };

    } catch (error) {
        console.error('❌ Telegram delete notification error:', error);
        return { success: false };
    }
}

/**
 * Send test message to verify bot is working
 */
async function sendTestMessage() {
    if (!bot || !process.env.TELEGRAM_ADMIN_CHAT_ID) {
        throw new Error('Telegram bot not configured');
    }

    const message = `
✅ *TELEGRAM BOT TEST*

Your TTD Registration Bot is working perfectly!

🤖 Bot: Active
📱 Notifications: Enabled
⏰ Time: ${new Date().toLocaleString('en-IN')}

You will now receive instant notifications for:
• New team registrations
• Team verifications
• Team deletions
        `;

    await bot.sendMessage(
        process.env.TELEGRAM_ADMIN_CHAT_ID,
        message,
        { parse_mode: 'Markdown' }
    );

    return { success: true, message: 'Test message sent!' };
}

module.exports = {
    sendNewTeamNotification,
    sendTeamVerifiedNotification,
    sendTeamDeletedNotification,
    sendTestMessage
};