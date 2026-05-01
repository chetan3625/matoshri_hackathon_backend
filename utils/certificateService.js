const nodemailer = require('nodemailer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// Configure Nodemailer
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s+/g, '') : ''
    },
    connectionTimeout: 15000, // increased to 15 seconds
    greetingTimeout: 15000,
    socketTimeout: 15000,
});

/**
 * Generates a personalized certificate PDF
 * @param {string} studentName 
 * @param {string} rank (1st, 2nd, 3rd, or Participated)
 * @returns {Promise<Uint8Array>}
 */
async function generateCertificate(studentName, rank) {
    try {
        const templatePath = path.join(__dirname, '..', 'templates', 'certificate_template.pdf');

        if (!fs.existsSync(templatePath)) {
            throw new Error('Certificate template not found at ' + templatePath);
        }

        const existingPdfBytes = fs.readFileSync(templatePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();

        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
        const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // --- Refined Coordinates ---

        // 1. Hide the placeholder name (Yash Yuvraj Shelke)
        // Adjust these values to perfectly cover the text area
        firstPage.drawRectangle({
            x: 200,
            y: height / 2 - 15,
            width: width - 400,
            height: 45,
            color: rgb(1, 1, 1), // White
        });

        // 2. Draw the Student Name
        const nameFontSize = 40;
        const nameWidth = fontItalic.widthOfTextAtSize(studentName, nameFontSize);
        firstPage.drawText(studentName, {
            x: (width / 2) - (nameWidth / 2),
            y: height / 2 - 10,
            size: nameFontSize,
            font: fontItalic,
            color: rgb(0.07, 0.15, 0.28), // Dark Navy Blue
        });

        // 3. Incorporate Rank into the paragraph
        if (rank !== 'Participated') {
            firstPage.drawRectangle({
                x: 100,
                y: height / 2 - 110, // Shifted Up
                width: width - 200,
                height: 15, // Thinner box
                color: rgb(1, 1, 1),
            });

            const rankText = `This certificate is awarded for securing ${rank} Position and in recognition of the participant's`;
            const fontSize = 14;
            const textWidth = fontRegular.widthOfTextAtSize(rankText, fontSize);

            firstPage.drawText(rankText, {
                x: (width / 2) - (textWidth / 2),
                y: height / 2 - 105, // Shifted Up
                size: fontSize,
                font: fontRegular,
                color: rgb(0.3, 0.3, 0.3),
            });
        }

        return await pdfDoc.save();
    } catch (error) {
        console.error('Error generating certificate:', error);
        throw error;
    }
}

/**
 * Sends certificate email to student
 * @param {string} email 
 * @param {string} name 
 * @param {string} rank 
 * @param {Uint8Array} pdfBytes 
 */
async function sendCertificateEmail(email, name, rank, pdfBytes) {
    const mailOptions = {
        from: `"Matoshri Hackathon" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Your Hackathon Certificate - ${rank}`,
        text: `Hi ${name},\n\nCongratulations on your performance in the Matoshri Hackathon! Please find your ${rank} certificate attached.\n\nBest regards,\nMatoshri Team`,
        attachments: [
            {
                filename: `Certificate_${name.replace(/\s+/g, '_')}.pdf`,
                content: Buffer.from(pdfBytes),
                contentType: 'application/pdf'
            }
        ]
    };

    return transporter.sendMail(mailOptions);
}

module.exports = {
    generateCertificate,
    sendCertificateEmail
};
