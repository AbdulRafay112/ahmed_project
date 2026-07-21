const pdf = require("pdf-parse");

exports.readPDF = async (req, res) => {

    try {

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No PDF uploaded."
            });
        }

        const buffer = req.file.buffer;

        const data = await pdf(buffer);

        const text = data.text;

        const lines = text
            .split("\n")
            .map(line => line.trim())
            .filter(line => line !== "");

        const items = [];

        let description = "";

        for (const line of lines) {

            // Line contains only an amount
            const amountOnly = line.match(/^\d+(?:,\d+)?(?:\.\d+)?$/);

            if (amountOnly) {

                items.push({
                    description: description.trim(),
                    amount: Number(line.replace(/,/g, ""))
                });

                description = "";

            } else {

                // Description followed by amount on the same line
                const sameLine = line.match(/^(.*?)(\d+(?:,\d+)?(?:\.\d+)?)$/);

                if (sameLine) {

                    items.push({
                        description: sameLine[1].trim(),
                        amount: Number(sameLine[2].replace(/,/g, ""))
                    });

                    description = "";

                } else {

                    description += " " + line;

                }

            }

        }

        return res.json({
            success: true,
            items
        });

    } catch (err) {

        console.error("PDF Parse Error:", err);

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }

};