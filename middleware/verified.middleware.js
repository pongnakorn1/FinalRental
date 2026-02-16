export const requireVerified = (req, res, next) => {
  if (req.user.kyc_status !== 'approved')
    return res.status(403).json({
      message: "Please complete KYC verification"
    });

  next();
};
