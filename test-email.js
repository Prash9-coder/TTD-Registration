require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    try {
        const info = await transporter.sendMail({
            from: `"TTD Test" <${process.env.SMTP_USER}>`,
            to: 'your-test-email@gmail.com',
            subject: 'Test Email - TTD Registration',
            html: '<h1>Email Working! ✅</h1><p>Your SMTP configuration is correct.</p>'
        });

        console.log('✅ Email sent:', info.messageId);
        console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
    } catch (error) {
        console.error('❌ Email failed:', error);
    }
}

testEmail();