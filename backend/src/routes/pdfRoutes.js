const router = require("express").Router();

const upload = require("../../middleware/upload");

const { readPDF } = require("../../controllers/pdfController");

router.post("/invoice", upload.single("pdf"), readPDF);

module.exports = router;