export async function POST(request: Request) {
  const requestData = await request.json();

  try {
    // Extract data from request
    const email = requestData.requestedInfo.email;
    const physicalAddress = requestData.requestedInfo.physicalAddress;

    const errors: any = {};

    // Example: Reject example.com emails
    if (email && email.endsWith("@example.com")) {
      errors.email = "Example.com emails are not allowed";
    }

    // Example: Validate physical address
    if (physicalAddress) {
      if (physicalAddress.postalCode && physicalAddress.postalCode.length < 5) {
        if (!errors.physicalAddress) errors.physicalAddress = {};
        errors.physicalAddress.postalCode = "Invalid postal code";
      }

      if (physicalAddress.countryCode === "XY") {
        if (!errors.physicalAddress) errors.physicalAddress = {};
        errors.physicalAddress.countryCode = "We don't ship to this country";
      }
    }

    // Return errors if any found
    if (Object.keys(errors).length > 0) {
      return Response.json({
        errors,
        /*request: {
          calls: [], // Replace the old calls with new ones
          chainId: numberToHex(84532), // Base Sepolia
          version: "1.0",
        },*/
      });
    }

    // Success - no validation errors - you HAVE to return the original calls
    return Response.json({
      request: {
        calls: requestData.calls,
        chainId: requestData.chainId,
        version: requestData.version,
      },
    });

  } catch (error) {
    console.error("Error processing data:", error);
    return Response.json({
      errors: { server: "Server error validating data" }
    });
  }
} 